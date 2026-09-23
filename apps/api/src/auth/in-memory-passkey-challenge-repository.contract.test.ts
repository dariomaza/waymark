import { InMemoryPasskeyChallengeRepository } from "./passkey-challenge-repository.fake.js";
import {
  passkeyChallengeRepositoryContract,
  type PasskeyChallengeRepositoryContext,
} from "./passkey-challenge-repository.contract.js";

/** Run 1 of 2: the in-memory implementation, and the reference. */
passkeyChallengeRepositoryContract({
  name: "InMemoryPasskeyChallengeRepository",
  setUp: async (): Promise<PasskeyChallengeRepositoryContext> => ({
    challenges: new InMemoryPasskeyChallengeRepository(),
    givenTheUser: async () => {},
  }),
  tearDown: async () => {},
});
