import { CreateProjectInputSchema, type CreateProjectInput, type Project } from "@sumi/contract";
import type { ProjectDoc } from "./db";
import { isDuplicateKey } from "./db";
import { ConflictError, parse } from "./errors";
import { assertUserExists, recordActivity, type Ctx } from "./shared";

function toProject(doc: ProjectDoc): Project {
  return { key: doc._id, name: doc.name, createdAt: doc.createdAt };
}

export function createProjectService({ cols, tx }: Ctx) {
  return {
    async create(actorId: string, input: CreateProjectInput): Promise<Project> {
      const data = parse(CreateProjectInputSchema, input);
      const doc: ProjectDoc = { _id: data.key, name: data.name, lastNumber: 0, createdAt: new Date() };
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

    async list(): Promise<Project[]> {
      const docs = await cols.projects.find().sort({ _id: 1 }).toArray();
      return docs.map(toProject);
    },
  };
}
