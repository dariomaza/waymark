import { InMemoryPasskeyRepository } from "./passkey-repository.fake.js";
import {
  passkeyRepositoryContract,
  type PasskeyRepositoryContext,
} from "./passkey-repository.contract.js";

/**
 * Run 1 of 2: the in-memory implementation.
 *
 * This is the reference. A case that fails here is a case where the CONTRACT
 * is wrong, not the database — see
 * `persistence/prisma-passkey-repository.contract.test.ts` for run 2.
 */
passkeyRepositoryContract({
  name: "InMemoryPasskeyRepository",
  setUp: async (): Promise<PasskeyRepositoryContext> => ({
    passkeys: new InMemoryPasskeyRepository(),
    // Nothing to satisfy: a Map has no foreign keys. The database run is where
    // this does work, which is the point of it being the harness's job.
    givenTheUser: async () => {},
  }),
  tearDown: async () => {},
});
