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
    return { machineTokens: new PrismaMachineTokenRepository(database.client) };
  },
  tearDown: async () => {},
});
