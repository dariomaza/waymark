import type { RepositoryHarness } from "@waymark/domain-contract-tests";
import { beforeEach, describe, expect, it } from "vitest";

import type { Passkey } from "./passkey.js";
import type { PasskeyRepository } from "./passkey-repository.js";

/**
 * # The shared contract for `PasskeyRepository`
 *
 * Run twice, exactly as every other repository in this project is: once
 * against the in-memory implementation, once against Prisma on a real SQLite
 * file. Two runs of one suite is the only thing that makes a port worth its
 * indirection — a fake that has never been measured against the real adapter
 * is a second implementation of nothing.
 *
 * It lives here rather than in `@waymark/domain-contract-tests` for the reason
 * `machine-token-repository.contract.ts` spells out: that package exists so
 * the DOMAIN's ports can be described without `@waymark/domain` depending on a
 * test framework, and a credential is not a domain concept. Moving this there
 * would make it depend on `@waymark/api`, which already devDepends on it, and
 * a cycle is a worse thing to own than a suite that sits beside its port.
 *
 * ## Why the harness has to be able to make a person
 *
 * Unlike a machine token, a passkey belongs to somebody, and in the database
 * that is a foreign key. `givenTheUser` is how each run satisfies it: a no-op
 * for the fake, an insert for Prisma. Hiding that behind the harness is what
 * lets the CASES be about passkeys rather than about schemas.
 */

const A_MOMENT = new Date("2026-04-01T10:00:00.000Z");
const A_LATER_MOMENT = new Date("2026-04-01T11:30:00.000Z");

const DARIO = "user-dario";
const SOMEBODY_ELSE = "user-elena";

const aPasskey = (overrides: Partial<Passkey> = {}): Passkey => ({
  id: "passkey-1",
  userId: DARIO,
  credentialId: "credential-1",
  publicKey: "public-key-1",
  signCount: 0,
  transports: ["internal"],
  label: "Pixel 8",
  createdAt: A_MOMENT,
  lastUsedAt: null,
  ...overrides,
});

export const passkeyRepositoryContract = (
  harness: RepositoryHarness<PasskeyRepositoryContext>,
): void => {
  describe(`PasskeyRepository contract: ${harness.name}`, () => {
    let passkeys: PasskeyRepository;
    let givenTheUser: (id: string) => Promise<void>;

    beforeEach(async () => {
      ({ passkeys, givenTheUser } = await harness.setUp());
      await givenTheUser(DARIO);
      await givenTheUser(SOMEBODY_ELSE);
    });

    describe("finding the one an assertion names", () => {
      it("answers null for a credential id nobody registered", async () => {
        expect(await passkeys.findByCredentialId("never-issued")).toBeNull();
      });

      it("finds the passkey behind a credential id it stored", async () => {
        await passkeys.create(aPasskey({ credentialId: "cred-a" }));

        expect((await passkeys.findByCredentialId("cred-a"))?.label).toBe(
          "Pixel 8",
        );
      });

      /**
       * This lookup is what decides WHOSE session to open: a
       * discoverable-credential sign-in carries no username, so a passkey that
       * came back without its owner would be a sign-in with nobody behind it.
       */
      it("carries the person it belongs to, which is the whole answer", async () => {
        await passkeys.create(
          aPasskey({ credentialId: "cred-b", userId: SOMEBODY_ELSE }),
        );

        expect((await passkeys.findByCredentialId("cred-b"))?.userId).toBe(
          SOMEBODY_ELSE,
        );
      });

      it("gives back every field it was handed", async () => {
        const stored = aPasskey({
          id: "passkey-7",
          credentialId: "cred-7",
          publicKey: "public-key-7",
          signCount: 42,
          transports: ["hybrid", "internal"],
          label: "Móvil de Darío",
          createdAt: A_MOMENT,
          lastUsedAt: A_LATER_MOMENT,
        });
        await passkeys.create(stored);

        expect(await passkeys.findByCredentialId("cred-7")).toEqual(stored);
      });

      it("tells one credential id from another", async () => {
        await passkeys.create(
          aPasskey({ id: "a", credentialId: "cred-a", label: "Phone" }),
        );
        await passkeys.create(
          aPasskey({ id: "b", credentialId: "cred-b", label: "Laptop" }),
        );

        expect((await passkeys.findByCredentialId("cred-b"))?.label).toBe(
          "Laptop",
        );
      });

      /**
       * A browser that reports no transports is ordinary, not an error, and an
       * empty list has to survive the round trip as an empty list — never as a
       * `[""]` that an over-eager split would produce.
       */
      it("keeps an empty transport list empty", async () => {
        await passkeys.create(aPasskey({ credentialId: "cred-c", transports: [] }));

        expect((await passkeys.findByCredentialId("cred-c"))?.transports).toEqual(
          [],
        );
      });

      it("keeps a never-used passkey's last use null", async () => {
        await passkeys.create(aPasskey({ credentialId: "cred-d" }));

        expect(
          (await passkeys.findByCredentialId("cred-d"))?.lastUsedAt,
        ).toBeNull();
      });
    });

    describe("refusing a credential id that is already registered", () => {
      /**
       * The browser's `excludeCredentials` is what normally stops this, and it
       * is a courtesy rather than a guarantee — it lives in the request, which
       * is the one place an attacker is. The index is the guarantee.
       */
      it("rejects a second registration of the same credential", async () => {
        await passkeys.create(aPasskey({ id: "a", credentialId: "cred-a" }));

        await expect(
          passkeys.create(aPasskey({ id: "b", credentialId: "cred-a" })),
        ).rejects.toThrow();
      });

      it("rejects it even when the second one claims another person", async () => {
        await passkeys.create(aPasskey({ id: "a", credentialId: "cred-a" }));

        await expect(
          passkeys.create(
            aPasskey({ id: "b", credentialId: "cred-a", userId: SOMEBODY_ELSE }),
          ),
        ).rejects.toThrow();
      });
    });

    describe("listing what one person has", () => {
      it("answers an empty list for somebody with no passkeys", async () => {
        expect(await passkeys.listForUser(DARIO)).toEqual([]);
      });

      it("answers oldest first, so a list does not reshuffle between reads", async () => {
        await passkeys.create(
          aPasskey({
            id: "b",
            credentialId: "cred-b",
            label: "Laptop",
            createdAt: A_LATER_MOMENT,
          }),
        );
        await passkeys.create(
          aPasskey({
            id: "a",
            credentialId: "cred-a",
            label: "Phone",
            createdAt: A_MOMENT,
          }),
        );

        expect((await passkeys.listForUser(DARIO)).map((one) => one.label)).toEqual(
          ["Phone", "Laptop"],
        );
      });

      /**
       * A machine token is deliberately visible to everybody who could have
       * minted one (ADR 18), because it is a key to the shared house. A
       * passkey is a particular person's particular device, and the list of
       * somebody's authenticators is information about them.
       */
      it("never answers with somebody else's device", async () => {
        await passkeys.create(
          aPasskey({ id: "mine", credentialId: "cred-a", label: "Phone" }),
        );
        await passkeys.create(
          aPasskey({
            id: "theirs",
            credentialId: "cred-b",
            label: "Their laptop",
            userId: SOMEBODY_ELSE,
          }),
        );

        expect((await passkeys.listForUser(DARIO)).map((one) => one.label)).toEqual(
          ["Phone"],
        );
      });

      it("answers several, because a phone and a laptop are two devices", async () => {
        await passkeys.create(aPasskey({ id: "a", credentialId: "cred-a" }));
        await passkeys.create(
          aPasskey({ id: "b", credentialId: "cred-b", createdAt: A_LATER_MOMENT }),
        );

        expect(await passkeys.listForUser(DARIO)).toHaveLength(2);
      });
    });

    describe("recording that one was used", () => {
      it("stamps the moment, which is what an abandoned device is spotted by", async () => {
        await passkeys.create(aPasskey({ credentialId: "cred-a" }));

        await passkeys.recordUse("passkey-1", A_LATER_MOMENT, 0);

        expect((await passkeys.findByCredentialId("cred-a"))?.lastUsedAt).toEqual(
          A_LATER_MOMENT,
        );
      });

      it("moves the counter in the same write, because it is the same fact", async () => {
        await passkeys.create(aPasskey({ credentialId: "cred-a", signCount: 7 }));

        await passkeys.recordUse("passkey-1", A_LATER_MOMENT, 8);

        expect((await passkeys.findByCredentialId("cred-a"))?.signCount).toBe(8);
      });

      it("leaves a zero counter at zero, which is what most phones report", async () => {
        await passkeys.create(aPasskey({ credentialId: "cred-a", signCount: 0 }));

        await passkeys.recordUse("passkey-1", A_LATER_MOMENT, 0);

        expect((await passkeys.findByCredentialId("cred-a"))?.signCount).toBe(0);
      });

      it("touches nothing else", async () => {
        const stored = aPasskey({ credentialId: "cred-a" });
        await passkeys.create(stored);

        await passkeys.recordUse("passkey-1", A_LATER_MOMENT, 3);

        expect(await passkeys.findByCredentialId("cred-a")).toEqual({
          ...stored,
          lastUsedAt: A_LATER_MOMENT,
          signCount: 3,
        });
      });

      /**
       * A passkey removed while one of its sign-ins was still in flight is an
       * ordinary race, not a 500 on the way out.
       */
      it("shrugs at an id that is no longer there", async () => {
        await expect(
          passkeys.recordUse("gone", A_LATER_MOMENT, 1),
        ).resolves.not.toThrow();
      });
    });

    describe("removing one", () => {
      it("says false when the id names nothing", async () => {
        expect(await passkeys.deleteFor(DARIO, "never-existed")).toBe(false);
      });

      it("removes the one it names and says so", async () => {
        await passkeys.create(aPasskey({ credentialId: "cred-a" }));

        expect(await passkeys.deleteFor(DARIO, "passkey-1")).toBe(true);
        expect(await passkeys.findByCredentialId("cred-a")).toBeNull();
      });

      it("leaves the person's other devices alone", async () => {
        await passkeys.create(aPasskey({ id: "a", credentialId: "cred-a" }));
        await passkeys.create(aPasskey({ id: "b", credentialId: "cred-b" }));

        await passkeys.deleteFor(DARIO, "a");

        expect((await passkeys.listForUser(DARIO)).map((one) => one.id)).toEqual([
          "b",
        ]);
      });

      /**
       * The same answer as "there is no such passkey", on purpose. A refusal
       * that could be told apart from a miss would confirm the existence of
       * somebody else's credential to whoever guessed at its id.
       */
      it("will not remove somebody else's, and does not admit that it exists", async () => {
        await passkeys.create(
          aPasskey({ id: "theirs", credentialId: "cred-b", userId: SOMEBODY_ELSE }),
        );

        expect(await passkeys.deleteFor(DARIO, "theirs")).toBe(false);
        expect(await passkeys.findByCredentialId("cred-b")).not.toBeNull();
      });

      /**
       * Removing every passkey is allowed, and there is no rule against it,
       * because there is no state in which one is the only way in: the
       * password form is always on the sign-in screen (ADR 19).
       */
      it("lets somebody remove the last one they have", async () => {
        await passkeys.create(aPasskey({ credentialId: "cred-a" }));

        expect(await passkeys.deleteFor(DARIO, "passkey-1")).toBe(true);
        expect(await passkeys.listForUser(DARIO)).toEqual([]);
      });
    });
  });
};

/**
 * What a `PasskeyRepository` contract run needs: the port, and a way to make
 * the person a passkey belongs to — which is a foreign key in the database and
 * nothing at all in the fake.
 */
export interface PasskeyRepositoryContext {
  readonly passkeys: PasskeyRepository;
  readonly givenTheUser: (id: string) => Promise<void>;
}
