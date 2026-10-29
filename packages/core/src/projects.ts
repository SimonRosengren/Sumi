import {
  CreateProjectInputSchema,
  DEFAULT_LANES,
  ProjectKeySchema,
  SetLanesInputSchema,
  type CreateProjectInput,
  type Lane,
  type Project,
  type SetLanesInput,
} from "@sumi/contract";
import type { ProjectDoc } from "./db";
import { isDuplicateKey } from "./db";
import { ConflictError, NotFoundError, ValidationError, parse } from "./errors";
import { assertUserExists, lanesOf, recordActivity, type Ctx } from "./shared";

function toProject(doc: ProjectDoc): Project {
  return { key: doc._id, name: doc.name, lanes: lanesOf(doc), createdAt: doc.createdAt };
}

/** `In progress` -> `in_progress`. The id is only a handle, so this just has to be readable. */
function slug(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
  return base || "lane";
}

export function createProjectService({ cols, tx }: Ctx) {
  return {
    async create(actorId: string, input: CreateProjectInput): Promise<Project> {
      const data = parse(CreateProjectInputSchema, input);
      const doc: ProjectDoc = {
        _id: data.key,
        name: data.name,
        lanes: DEFAULT_LANES.map((lane) => ({ ...lane })),
        lastNumber: 0,
        createdAt: new Date(),
      };
      try {
        await tx(async (session) => {
          await assertUserExists(cols, actorId, session, "Actor");
          await cols.projects.insertOne(doc, { session });
          await recordActivity(cols, session, {
            actorId,
            action: "project.created",
            projectKey: data.key,
            data: { name: data.name },
          });
        });
      } catch (err) {
        if (isDuplicateKey(err)) throw new ConflictError(`Project ${data.key} already exists`);
        throw err;
      }
      return toProject(doc);
    },

    /**
     * Replaces the project's lanes (ADR 0028). Lanes keep their id when renamed or moved; new ones get an id
     * made from their name. A lane that still holds tickets cannot be removed.
     */
    async setLanes(actorId: string, projectKey: string, input: SetLanesInput): Promise<Project> {
      parse(ProjectKeySchema, projectKey);
      const { lanes: wanted } = parse(SetLanesInputSchema, input);
      return tx(async (session) => {
        await assertUserExists(cols, actorId, session, "Actor");
        const project = await cols.projects.findOne({ _id: projectKey }, { session });
        if (!project) throw new NotFoundError(`Project ${projectKey} not found`);
        const current = lanesOf(project);

        const known = new Set(current.map((l) => l.id));
        const given = wanted.flatMap((l) => (l.id === undefined ? [] : [l.id]));
        for (const id of given) {
          if (!known.has(id)) throw new ValidationError(`Unknown lane ${id}`);
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
          const count = await cols.tickets.countDocuments({ projectKey, status: lane.id }, { session });
          if (count > 0) {
            throw new ConflictError(`Lane ${lane.name} still has ${count} ticket${count === 1 ? "" : "s"}; move them first`);
          }
        }

        if (JSON.stringify(lanes) === JSON.stringify(current)) return toProject(project);
        const updated = await cols.projects.findOneAndUpdate(
          { _id: projectKey },
          { $set: { lanes } },
          { returnDocument: "after", session },
        );
        if (!updated) throw new NotFoundError(`Project ${projectKey} not found`);
        await recordActivity(cols, session, {
          actorId,
          action: "project.lanes_updated",
          projectKey,
          data: { lanes },
        });
        return toProject(updated);
      });
    },

    async list(): Promise<Project[]> {
      const docs = await cols.projects.find().sort({ _id: 1 }).toArray();
      return docs.map(toProject);
    },
  };
}
