import {
  BoardIdSchema, CreateBoardInputSchema, ProjectKeySchema, RenameBoardInputSchema,
  DEFAULT_LANES, SetLanesInputSchema, type Lane, type SetLanesInput,
  type Board, type CreateBoardInput, type RenameBoardInput,
} from "@sumi/contract";
import type { BoardDoc } from "./db";
import { ConflictError, NotFoundError, ValidationError, parse } from "./errors";
import { assertUserExists, lockProject, recordActivity, type Ctx } from "./shared";

const toBoard = ({ _id, ...rest }: BoardDoc): Board => ({ id: _id, ...rest });

function slug(name: string): string {
  return name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32) || "lane";
}

export function createBoardService({ cols, tx }: Ctx) {
  return {
    async get(id: string): Promise<Board> {
      parse(BoardIdSchema, id);
      const board = await cols.boards.findOne({ _id: id });
      if (!board) throw new NotFoundError(`Board ${id} not found`);
      return toBoard(board);
    },

    async setLanes(actorId: string, id: string, input: SetLanesInput): Promise<Board> {
      parse(BoardIdSchema, id);
      const { lanes: wanted } = parse(SetLanesInputSchema, input);
      return tx(async (session) => {
        await assertUserExists(cols, actorId, session, "Actor");
        const board = await cols.boards.findOne({ _id: id }, { session });
        if (!board) throw new NotFoundError(`Board ${id} not found`);
        await lockProject(cols, board.projectKey, session);
        const current = board.lanes;
        const known = new Set(current.map((l) => l.id));
        const given = wanted.flatMap((l) => l.id === undefined ? [] : [l.id]);
        for (const laneId of given) {
          if (!known.has(laneId)) throw new ValidationError(`Unknown lane ${laneId}`);
        }
        if (new Set(given).size !== given.length) throw new ValidationError("A lane is listed twice");
        const taken = new Set([...known, ...given]);
        const lanes: Lane[] = wanted.map(({ id, name }) => {
          if (id !== undefined) return { id, name };
          const base = slug(name);
          let fresh = base;
          for (let n = 2; taken.has(fresh); n++) fresh = `${base.slice(0, 36)}_${n}`;
          taken.add(fresh);
          return { id: fresh, name };
        });
        const kept = new Set(lanes.map((l) => l.id));
        for (const lane of current) {
          if (kept.has(lane.id)) continue;
          const count = await cols.tickets.countDocuments({ boardId: id, status: lane.id }, { session });
          if (count > 0) throw new ConflictError(`Lane ${lane.name} still has ${count} ticket${count === 1 ? "" : "s"}; move them first`);
        }
        if (JSON.stringify(lanes) === JSON.stringify(current)) return toBoard(board);
        await cols.boards.updateOne({ _id: id }, { $set: { lanes } }, { session });
        await recordActivity(cols, session, {
          actorId, action: "board.lanes_updated", projectKey: board.projectKey, data: { boardId: id, lanes },
        });
        return toBoard({ ...board, lanes });
      });
    },

    async list(projectKey: string): Promise<Board[]> {
      parse(ProjectKeySchema, projectKey);
      if (!await cols.projects.findOne({ _id: projectKey })) throw new NotFoundError(`Project ${projectKey} not found`);
      return (await cols.boards.find({ projectKey }).sort({ createdAt: 1, _id: 1 }).toArray()).map(toBoard);
    },

    async create(actorId: string, input: CreateBoardInput): Promise<Board> {
      const data = parse(CreateBoardInputSchema, input);
      return tx(async (session) => {
        await assertUserExists(cols, actorId, session, "Actor");
        await lockProject(cols, data.projectKey, session);
        const doc: BoardDoc = { _id: crypto.randomUUID(), ...data, lanes: DEFAULT_LANES.map((lane) => ({ ...lane })), createdAt: new Date() };
        await cols.boards.insertOne(doc, { session });
        await recordActivity(cols, session, {
          actorId, action: "board.created", projectKey: data.projectKey, data: { boardId: doc._id, name: doc.name },
        });
        return toBoard(doc);
      });
    },

    async rename(actorId: string, id: string, input: RenameBoardInput): Promise<Board> {
      parse(BoardIdSchema, id);
      const { name } = parse(RenameBoardInputSchema, input);
      return tx(async (session) => {
        await assertUserExists(cols, actorId, session, "Actor");
        const before = await cols.boards.findOne({ _id: id }, { session });
        if (!before) throw new NotFoundError(`Board ${id} not found`);
        if (before.name === name) return toBoard(before);
        await cols.boards.updateOne({ _id: id }, { $set: { name } }, { session });
        await recordActivity(cols, session, {
          actorId, action: "board.renamed", projectKey: before.projectKey, data: { boardId: id, from: before.name, to: name },
        });
        return toBoard({ ...before, name });
      });
    },

    async delete(actorId: string, id: string): Promise<void> {
      parse(BoardIdSchema, id);
      await tx(async (session) => {
        await assertUserExists(cols, actorId, session, "Actor");
        const board = await cols.boards.findOne({ _id: id }, { session });
        if (!board) throw new NotFoundError(`Board ${id} not found`);
        await lockProject(cols, board.projectKey, session);
        if (await cols.tickets.countDocuments({ boardId: id }, { session, limit: 1 })) {
          throw new ConflictError("Board still has tickets; transfer them first");
        }
        if (await cols.boards.countDocuments({ projectKey: board.projectKey }, { session }) <= 1) {
          throw new ConflictError("A project must have at least one board");
        }
        await cols.boards.deleteOne({ _id: id }, { session });
        await recordActivity(cols, session, {
          actorId, action: "board.deleted", projectKey: board.projectKey, data: { boardId: id, name: board.name },
        });
      });
    },
  };
}
