import { Role } from "@waymark/domain";
import { FakeClock, SequentialIdGenerator } from "@waymark/domain/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaMachineTokenRepository } from "../persistence/prisma-machine-token-repository.js";
import { PrismaSessionRepository } from "../persistence/prisma-session-repository.js";
import { PrismaUserRepository } from "../persistence/prisma-user-repository.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../persistence/testing/test-database.js";
import { AdministratorOnly, LastAdministrator, OwnAccount } from "./auth-errors.js";
import { CreateUser } from "./create-user.js";
import { ManageAccounts } from "./manage-accounts.js";
import { ScryptPasswordHasher } from "./password-hasher.js";
import type { User } from "./user.js";

const CHEAP_KDF = {
  cost: 1024,
  blockSize: 8,
  parallelism: 1,
  keyLength: 32,
  saltLength: 16,
} as const;

/**
 * # The rules of managing accounts, without HTTP in the way
 *
 * The routes are proven end to end in `http/account-management-routes.test.ts`.
 * What is here is what HTTP cannot stage: two administrators acting on each
 * other at the same instant, each holding the account as it was when their
 * request was authenticated.
 */
describe("managing accounts", () => {
  let database: TestDatabase;
  let users: PrismaUserRepository;
  let manage: ManageAccounts;
  let createUser: CreateUser;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.destroy();
  });

  beforeEach(async () => {
    await database.reset();
    users = new PrismaUserRepository(database.client);
    const hasher = new ScryptPasswordHasher(CHEAP_KDF);
    const clock = new FakeClock(new Date("2026-10-01T10:00:00.000Z"));
    const ids = new SequentialIdGenerator("user");
    createUser = new CreateUser({ users, hasher, ids, clock });
    manage = new ManageAccounts({
      users,
      sessions: new PrismaSessionRepository(database.client),
      machineTokens: new PrismaMachineTokenRepository(database.client),
      createUser,
      hasher,
      clock,
    });
  });

  const anAdministrator = async (username: string): Promise<User> =>
    await createUser.execute({
      username,
      password: "a-real-password",
      administrator: true,
    });

  /**
   * Both requests were authenticated while both were administrators. The
   * first demotion lands; the second arrives holding a stale account that
   * still says "administrator", and would take the last one away.
   */
  describe("two administrators demoting each other at once", () => {
    it("lets the first through and refuses the second with LastAdministrator", async () => {
      const dario = await anAdministrator("dario");
      const partner = await anAdministrator("partner");

      await manage.changeRole(dario, partner.id, Role.USER);

      await expect(manage.changeRole(partner, dario.id, Role.USER)).rejects.toBeInstanceOf(
        LastAdministrator,
      );
      expect((await users.findById(dario.id))?.role).toBe(Role.ADMINISTRATOR);
    });

    it("refuses a disable that would leave nobody the same way", async () => {
      const dario = await anAdministrator("dario");
      const partner = await anAdministrator("partner");

      await manage.disable(dario, partner.id);

      await expect(manage.disable(partner, dario.id)).rejects.toBeInstanceOf(LastAdministrator);
      expect((await users.findById(dario.id))?.disabledAt).toBeNull();
    });
  });

  it("refuses a person who is not an administrator before reading anything", async () => {
    await anAdministrator("dario");
    const partner = await createUser.execute({
      username: "partner",
      password: "a-real-password",
    });

    await expect(manage.list(partner)).rejects.toBeInstanceOf(AdministratorOnly);
  });

  it("refuses an administrator acting on their own account", async () => {
    const dario = await anAdministrator("dario");
    await anAdministrator("partner");

    await expect(manage.changeRole(dario, dario.id, Role.USER)).rejects.toBeInstanceOf(OwnAccount);
    await expect(manage.disable(dario, dario.id)).rejects.toBeInstanceOf(OwnAccount);
    await expect(
      manage.resetPassword(dario, dario.id),
    ).rejects.toBeInstanceOf(OwnAccount);
  });
});
