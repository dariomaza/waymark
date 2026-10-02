import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  userRepositoryContract,
  type UserRepositoryContext,
} from "../auth/user-repository.contract.js";
import { UnknownRole } from "./persistence-errors.js";
import { PrismaUserRepository } from "./prisma-user-repository.js";
import { createTestDatabase, type TestDatabase } from "./testing/test-database.js";

/**
 * Run 2 of 2: the exact same contract, against a real SQLite file. See
 * `auth/in-memory-user-repository.contract.test.ts` for run 1.
 */

let database: TestDatabase;

beforeAll(async () => {
  database = await createTestDatabase();
});

afterAll(async () => {
  await database.destroy();
});

userRepositoryContract({
  name: "PrismaUserRepository",
  setUp: async (): Promise<UserRepositoryContext> => {
    await database.reset();
    return { users: new PrismaUserRepository(database.client) };
  },
  tearDown: async () => {},
});

describe("an account whose stored role is not a role", () => {
  it("is refused rather than guessed into one", async () => {
    await database.reset();
    await database.client.$executeRaw`
      INSERT INTO "User" ("id", "username", "passwordHash", "role", "createdAt", "updatedAt")
      VALUES ('mallory', 'mallory', 'x', 'superuser', 0, 0)
    `;

    await expect(
      new PrismaUserRepository(database.client).findByUsername("mallory"),
    ).rejects.toBeInstanceOf(UnknownRole);
  });
});
