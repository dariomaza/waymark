import { afterAll, beforeAll } from "vitest";

import {
  passkeyRepositoryContract,
  type PasskeyRepositoryContext,
} from "../auth/passkey-repository.contract.js";
import { PrismaPasskeyRepository } from "./prisma-passkey-repository.js";
import { createTestDatabase, type TestDatabase } from "./testing/test-database.js";

/**
 * Run 2 of 2: the exact same contract, against a real SQLite file.
 *
 * Nothing is mocked. If a case passes here and in
 * `auth/in-memory-passkey-repository.contract.test.ts`, the two
 * implementations are interchangeable — which is what lets a use case be
 * tested against the fake and deployed against Prisma without a second
 * thought.
 */

let database: TestDatabase;

beforeAll(async () => {
  database = await createTestDatabase();
});

afterAll(async () => {
  await database.destroy();
});

passkeyRepositoryContract({
  name: "PrismaPasskeyRepository",
  setUp: async (): Promise<PasskeyRepositoryContext> => {
    await database.reset();

    return {
      passkeys: new PrismaPasskeyRepository(database.client),
      /**
       * A passkey belongs to somebody, and here that is a foreign key. This is
       * the half of the harness the in-memory run has nothing to do.
       */
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
