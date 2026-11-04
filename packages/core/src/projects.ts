import {
  CreateProjectInputSchema,
  DEFAULT_LANES,
  ProjectKeySchema,
  type CreateProjectInput,
  type Project,
} from "@sumi/contract";
import type { ProjectDoc } from "./db";
import { isDuplicateKey } from "./db";
import { ConflictError, NotFoundError, parse } from "./errors";
import { assertHuman, assertUserExists, recordActivity, type Ctx } from "./shared";

function toProject(doc: ProjectDoc): Project {
  return { key: doc._id, name: doc.name, createdAt: doc.createdAt };
}

export function createProjectService({ cols, tx }: Ctx) {
  return {
    async create(actorId: string, input: CreateProjectInput): Promise<Project> {
      const data = parse(CreateProjectInputSchema, input);
      const doc: ProjectDoc = {
        _id: data.key,
        name: data.name,
        lastNumber: 0,
        createdAt: new Date(),
      };
      try {
        await tx(async (session) => {
          await assertUserExists(cols, actorId, session, "Actor");
          await cols.projects.insertOne(doc, { session });
          const board = { _id: `${data.key}-general`, projectKey: data.key, name: "General", lanes: DEFAULT_LANES.map((lane) => ({ ...lane })), createdAt: doc.createdAt };
          await cols.boards.insertOne(board, { session });
          await recordActivity(cols, session, {
            actorId,
            action: "project.created",
            projectKey: data.key,
            data: { name: data.name },
          });
          await recordActivity(cols, session, {
            actorId,
            action: "board.created",
            projectKey: data.key,
            data: { boardId: board._id, name: board.name },
          });
        });
      } catch (err) {
        if (isDuplicateKey(err)) throw new ConflictError(`Project ${data.key} already exists`);
        throw err;
      }
      return toProject(doc);
    },

    /**
     * A human deletes a project with its tickets and its activity entries, comments included (ADR 0034). The
     * only trace is one `project.deleted` entry. The key can then be used again.
     */
    async delete(actorId: string, projectKey: string): Promise<void> {
      parse(ProjectKeySchema, projectKey);
      await tx(async (session) => {
        await assertHuman(cols, actorId, session, "Only humans can delete projects");
        const project = await cols.projects.findOneAndDelete({ _id: projectKey }, { session });
        if (!project) throw new NotFoundError(`Project ${projectKey} not found`);
        const { deletedCount: tickets } = await cols.tickets.deleteMany({ projectKey }, { session });
        await cols.boards.deleteMany({ projectKey }, { session });
        // Keep the trace of an earlier deletion of a project that had the same key.
        await cols.activity.deleteMany({ projectKey, action: { $ne: "project.deleted" } }, { session });
        await recordActivity(cols, session, {
          actorId,
          action: "project.deleted",
          projectKey,
          data: { name: project.name, tickets },
        });
      });
    },

    async list(): Promise<Project[]> {
      const docs = await cols.projects.find().sort({ _id: 1 }).toArray();
      return docs.map(toProject);
    },
  };
}
