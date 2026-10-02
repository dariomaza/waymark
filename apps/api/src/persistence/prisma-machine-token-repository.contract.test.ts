import { afterAll, beforeAll } from "vitest";

import {
  machineTokenRepositoryContract,
  type MachineTokenRepositoryContext,
} from "../auth/machine-token-repository.contract.js";
import { PrismaMachineTokenRepository } from "./prisma-machine-token-repository.js";
import { createTestDatabase, type TestDatabase } from "./testing/test-database.js";

/**
 * Run 2 of 2: the exact same contract, against a real SQLite file.
 *
 * Nothing is mocked. If a case passes here and in
 * `auth/in-memory-machine-token-repository.contract.test.ts`, the two
 * implementations are interchangeable — which is what lets a use case be tested
 * against the fake and deployed against Prisma without a second thought.
 */

let database: TestDatabase;

beforeAll(async () => {
  database = await createTestDatabase();
});

afterAll(async () => {
  await database.destroy();
});

machineTokenRepositoryContract({
  name: "PrismaMachineTokenRepository",
  setUp: async (): Promise<MachineTokenRepositoryContext> => {
    await database.reset();
    return {
      machineTokens: new PrismaMachineTokenRepository(database.client),
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
      givenTheSpace: async (id: string) => {
        await database.client.storageUnit.create({
          data: {
            id,
            name: id,
            kind: "ROOM",
            publicId: `public-${id}`,
            ownerId: "dario",
            createdAt: new Date("2026-04-01T09:00:00.000Z"),
            updatedAt: new Date("2026-04-01T09:00:00.000Z"),
          },
        });
      },
      deleteTheSpace: async (id: string) => {
        await database.client.storageUnit.delete({ where: { id } });
      },
    };
  },
  tearDown: async () => {},
});
