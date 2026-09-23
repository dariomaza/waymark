import type { RepositoryHarness } from "@waymark/domain-contract-tests";
import { beforeEach, describe, expect, it } from "vitest";

import {
  PasskeyCeremony,
  type PasskeyChallenge,
} from "./passkey-challenge.js";
import type { PasskeyChallengeRepository } from "./passkey-challenge-repository.js";

/**
 * # The shared contract for `PasskeyChallengeRepository`
 *
 * Run twice, in-memory and against SQLite, like every other port here.
 *
 * This is the suite that earns the port. Everything this table promises —
 * single use, expiry, and being bound to its own ceremony — is a property of
 * ONE STATEMENT, and "one statement" is exactly the kind of claim a fake can
 * satisfy by accident and a database can fail. Running the same cases against
 * both is what turns the promise into a fact.
 */

const A_MOMENT = new Date("2026-04-01T10:00:00.000Z");
const A_MINUTE_LATER = new Date("2026-04-01T10:01:00.000Z");
const A_HALF_HOUR_LATER = new Date("2026-04-01T10:30:00.000Z");
const AN_HOUR_LATER = new Date("2026-04-01T11:00:00.000Z");

const DARIO = "user-dario";

const aChallenge = (
  overrides: Partial<PasskeyChallenge> = {},
): PasskeyChallenge => ({
  id: "ceremony-1",
  ceremony: PasskeyCeremony.Authentication,
  challenge: "a-random-challenge",
  userId: null,
  createdAt: A_MOMENT,
  expiresAt: A_MINUTE_LATER,
  ...overrides,
});

export const passkeyChallengeRepositoryContract = (
  harness: RepositoryHarness<PasskeyChallengeRepositoryContext>,
): void => {
  describe(`PasskeyChallengeRepository contract: ${harness.name}`, () => {
    let challenges: PasskeyChallengeRepository;
    let givenTheUser: (id: string) => Promise<void>;

    beforeEach(async () => {
      ({ challenges, givenTheUser } = await harness.setUp());
      await givenTheUser(DARIO);
    });

    describe("spending one", () => {
      it("answers null for a ceremony id nobody was issued", async () => {
        expect(
          await challenges.consume(
            "never-issued",
            PasskeyCeremony.Authentication,
            A_MOMENT,
          ),
        ).toBeNull();
      });

      it("gives back every field it was handed", async () => {
        const stored = aChallenge({
          id: "ceremony-7",
          ceremony: PasskeyCeremony.Registration,
          challenge: "the-bytes-that-get-signed",
          userId: DARIO,
        });
        await challenges.create(stored);

        expect(
          await challenges.consume(
            "ceremony-7",
            PasskeyCeremony.Registration,
            A_MOMENT,
          ),
        ).toEqual(stored);
      });

      it("keeps a sign-in's owner null, because a sign-in has nobody yet", async () => {
        await challenges.create(aChallenge({ userId: null }));

        const spent = await challenges.consume(
          "ceremony-1",
          PasskeyCeremony.Authentication,
          A_MOMENT,
        );

        expect(spent?.userId).toBeNull();
      });
    });

    /**
     * The one property this whole table exists for. A challenge that can be
     * signed twice turns a captured assertion into a permanent credential.
     */
    describe("single use", () => {
      it("cannot be spent a second time", async () => {
        await challenges.create(aChallenge());

        await challenges.consume(
          "ceremony-1",
          PasskeyCeremony.Authentication,
          A_MOMENT,
        );

        expect(
          await challenges.consume(
            "ceremony-1",
            PasskeyCeremony.Authentication,
            A_MOMENT,
          ),
        ).toBeNull();
      });

      /**
       * Two requests arriving with the same ceremony id is what a replay looks
       * like. Exactly one of them may be served, and which one does not matter
       * — what matters is that the other gets nothing.
       */
      it("serves exactly one of two callers racing the same ceremony", async () => {
        await challenges.create(aChallenge());

        const [first, second] = await Promise.all([
          challenges.consume("ceremony-1", PasskeyCeremony.Authentication, A_MOMENT),
          challenges.consume("ceremony-1", PasskeyCeremony.Authentication, A_MOMENT),
        ]);

        expect([first, second].filter((spent) => spent !== null)).toHaveLength(1);
      });

      it("leaves other ceremonies alone when one is spent", async () => {
        await challenges.create(aChallenge({ id: "a" }));
        await challenges.create(aChallenge({ id: "b" }));

        await challenges.consume("a", PasskeyCeremony.Authentication, A_MOMENT);

        expect(
          await challenges.consume("b", PasskeyCeremony.Authentication, A_MOMENT),
        ).not.toBeNull();
      });
    });

    /**
     * Bound to the ceremony that issued it — in the `WHERE`, so that a handler
     * which forgot to compare still cannot spend a registration challenge on a
     * sign-in.
     */
    describe("bound to its own ceremony", () => {
      it("will not spend a registration challenge on a sign-in", async () => {
        await challenges.create(
          aChallenge({ ceremony: PasskeyCeremony.Registration, userId: DARIO }),
        );

        expect(
          await challenges.consume(
            "ceremony-1",
            PasskeyCeremony.Authentication,
            A_MOMENT,
          ),
        ).toBeNull();
      });

      it("will not spend a sign-in challenge on a registration", async () => {
        await challenges.create(
          aChallenge({ ceremony: PasskeyCeremony.Authentication }),
        );

        expect(
          await challenges.consume(
            "ceremony-1",
            PasskeyCeremony.Registration,
            A_MOMENT,
          ),
        ).toBeNull();
      });

      it("leaves the row alone when the ceremony did not match", async () => {
        await challenges.create(
          aChallenge({ ceremony: PasskeyCeremony.Registration, userId: DARIO }),
        );

        await challenges.consume(
          "ceremony-1",
          PasskeyCeremony.Authentication,
          A_MOMENT,
        );

        expect(
          await challenges.consume(
            "ceremony-1",
            PasskeyCeremony.Registration,
            A_MOMENT,
          ),
        ).not.toBeNull();
      });
    });

    describe("short lived", () => {
      it("is spendable right up to its expiry", async () => {
        await challenges.create(aChallenge({ expiresAt: A_MINUTE_LATER }));

        expect(
          await challenges.consume(
            "ceremony-1",
            PasskeyCeremony.Authentication,
            new Date(A_MINUTE_LATER.getTime() - 1),
          ),
        ).not.toBeNull();
      });

      it("is not spendable at the moment it lapses", async () => {
        await challenges.create(aChallenge({ expiresAt: A_MINUTE_LATER }));

        expect(
          await challenges.consume(
            "ceremony-1",
            PasskeyCeremony.Authentication,
            A_MINUTE_LATER,
          ),
        ).toBeNull();
      });

      it("is not spendable afterwards", async () => {
        await challenges.create(aChallenge({ expiresAt: A_MINUTE_LATER }));

        expect(
          await challenges.consume(
            "ceremony-1",
            PasskeyCeremony.Authentication,
            AN_HOUR_LATER,
          ),
        ).toBeNull();
      });
    });

    describe("sweeping the ones nobody finished", () => {
      it("removes the lapsed and says how many", async () => {
        await challenges.create(aChallenge({ id: "a", expiresAt: A_MINUTE_LATER }));
        await challenges.create(aChallenge({ id: "b", expiresAt: A_MINUTE_LATER }));

        expect(await challenges.deleteExpired(AN_HOUR_LATER)).toBe(2);
      });

      it("leaves a ceremony that is still in flight", async () => {
        await challenges.create(aChallenge({ id: "live", expiresAt: AN_HOUR_LATER }));
        await challenges.create(aChallenge({ id: "dead", expiresAt: A_MINUTE_LATER }));

        await challenges.deleteExpired(A_HALF_HOUR_LATER);

        expect(
          await challenges.consume(
            "live",
            PasskeyCeremony.Authentication,
            A_HALF_HOUR_LATER,
          ),
        ).not.toBeNull();
      });

      it("removes nothing when nothing has lapsed", async () => {
        await challenges.create(aChallenge({ expiresAt: AN_HOUR_LATER }));

        expect(await challenges.deleteExpired(A_MOMENT)).toBe(0);
      });
    });
  });
};

/**
 * What a run needs: the port, and a way to make the person a REGISTRATION
 * challenge belongs to — a foreign key in the database, nothing in the fake.
 */
export interface PasskeyChallengeRepositoryContext {
  readonly challenges: PasskeyChallengeRepository;
  readonly givenTheUser: (id: string) => Promise<void>;
}
