import { InMemoryUserRepository } from "./user-repository.fake.js";
import {
  userRepositoryContract,
  type UserRepositoryContext,
} from "./user-repository.contract.js";

/**
 * Run 1 of 2: the in-memory implementation, the reference. See
 * `persistence/prisma-user-repository.contract.test.ts` for run 2.
 */
userRepositoryContract({
  name: "InMemoryUserRepository",
  setUp: async (): Promise<UserRepositoryContext> => ({
    users: new InMemoryUserRepository(),
  }),
  tearDown: async () => {},
});
