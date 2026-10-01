import { InMemoryMachineTokenRepository } from "./machine-token-repository.fake.js";
import {
  machineTokenRepositoryContract,
  type MachineTokenRepositoryContext,
} from "./machine-token-repository.contract.js";

/**
 * Run 1 of 2: the in-memory implementation.
 *
 * This is the reference. A case that fails here is a case where the CONTRACT is
 * wrong, not the database — see `prisma-machine-token-repository.contract.test.ts`
 * for run 2.
 */
machineTokenRepositoryContract({
  name: "InMemoryMachineTokenRepository",
  setUp: async (): Promise<MachineTokenRepositoryContext> => ({
    machineTokens: new InMemoryMachineTokenRepository(),
    // Nothing to satisfy: a Map has no foreign keys.
    givenTheUser: async () => {},
    // Nor spaces: the fake keeps a chosen id whether or not a space has it,
    // and what may be reached is decided against the stored tree anyway.
    givenTheSpace: async () => {},
    deleteTheSpace: async () => {},
  }),
  tearDown: async () => {},
});
