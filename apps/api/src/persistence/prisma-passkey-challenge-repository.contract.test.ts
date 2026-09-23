import { afterAll, beforeAll } from "vitest";

import {
  passkeyChallengeRepositoryContract,
  type PasskeyChallengeRepositoryContext,
} from "../auth/passkey-challenge-repository.contract.js";
import { PrismaPasskeyChallengeRepository } from "./prisma-passkey-challenge-repository.js";
import { createTestDatabase, type TestDatabase } from "./testing/test-database.js";

/**
 * Run 2 of 2, and the run that matters most for this port: single use is a
 * property of one `DELETE`, and only a database can be wrong about it.
 */

let database: TestDatabase;

beforeAll(async () => {
  database = await createTestDatabase();
});

afterAll(async () => {
  await database.destroy();
});

passkeyChallengeRepositoryContract({
  name: "PrismaPasskeyChallengeRepository",
  setUp: async (): Promise<PasskeyChallengeRepositoryContext> => {
    await database.reset();

    return {
      challenges: new PrismaPasskeyChallengeRepository(database.client),
      givenTheUser: async (id: string) => {
        await database.client.user.create({
          data: {
            id,
            username: id,
            passwordHash: "not-a-real-hash",
            createdAt: new Date("2026-04-01T09:00:00.000Z"),
            updatedAt: new Date("2026-04-01T09:00:00.000Z"),
          },
        });
      },
    };
  },
  tearDown: async () => {},
});
