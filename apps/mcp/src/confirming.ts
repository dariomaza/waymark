import { randomBytes } from "node:crypto";

/**
 * # Why a write is two calls, and why the second one cannot be guessed
 *
 * The person who asked for this server asked for the two tools that change the
 * inventory to be CONFIRMED rather than automatic. The obvious way to build
 * that is a `confirm: true` argument, and it is worthless: the reader is a
 * model, `true` is the value it will reach for, and a mechanism a reader can
 * satisfy by pattern-matching is a mechanism that has already been defeated.
 * The same is true of `"yes"`, of `"I confirm"`, and of every other word a
 * confident guess produces. `confirming.test.ts` asserts each of them fails.
 *
 * So the confirmation is a CAPABILITY rather than an assertion. A write tool
 * called without one does not write; it resolves what it would do, describes
 * it in names and places rather than ids, and mints a code. The code is:
 *
 * - **Unguessable.** Fifty random bits from a CSPRNG. Nothing in the request
 *   implies it and no amount of confidence produces it, so a reader that
 *   presents one has been TOLD it by this server.
 * - **Bound to the exact plan.** It is minted against a fingerprint of what
 *   was described, and a claim that does not match that fingerprint is
 *   refused. A confirmation given for moving two things into Box 3 cannot be
 *   spent on moving three things into the attic.
 * - **Single use.** The write happens once. A repeated call with the same code
 *   finds nothing and writes nothing.
 * - **Short-lived.** Five minutes, so a confirmation cannot be banked and
 *   spent much later against an inventory that has moved on.
 *
 * What that buys is structural rather than hopeful: **a write is impossible
 * unless its plain-language description was put in front of the reader first**,
 * in the conversation, where the person can see it. It does not — and nothing
 * inside an MCP server can — PROVE that a human read it. That is what the
 * read-only machine token is for (ADR 17): with one, a write is refused by the
 * API regardless of what anything here decides. The confirmation is the
 * courtesy; the scope is the guarantee.
 *
 * The codes live in this process and nowhere else, so a restart forgets every
 * pending confirmation. That is right rather than unfortunate: the preview was
 * part of a conversation, and a restart ended it.
 */
export const CONFIRMATION_LIFETIME_MS = 5 * 60 * 1000;

/**
 * Crockford Base32, like the code printed under a label's QR symbol —
 * unambiguous to read back, and recognisably a Waymark code rather than a
 * word.
 */
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
/** Ten characters in two groups: fifty bits, which nothing guesses. */
const CODE_BYTES = 10;

export type Claim<TPlan> =
  /** The code was minted for exactly this, and has now been spent. */
  | { readonly kind: "confirmed"; readonly plan: TPlan }
  /** No such code: never minted, already spent, or lapsed. */
  | { readonly kind: "unknown" }
  /** A real code, for a different write than the one now being asked for. */
  | { readonly kind: "mismatched" };

interface Pending<TPlan> {
  readonly fingerprint: string;
  readonly plan: TPlan;
  readonly expiresAt: number;
}

export class WriteConfirmations {
  readonly #pending = new Map<string, Pending<unknown>>();
  readonly #now: () => number;

  constructor(now: () => number = Date.now) {
    this.#now = now;
  }

  /**
   * Records what WOULD be done and answers the code that will do it.
   *
   * `fingerprint` is the canonical form of the plan's inputs. It is what makes
   * the code a confirmation of this write rather than of writing in general.
   */
  propose<TPlan>(fingerprint: string, plan: TPlan): string {
    this.#forgetLapsed();

    const code = mintCode();
    this.#pending.set(code, {
      fingerprint,
      plan,
      expiresAt: this.#now() + CONFIRMATION_LIFETIME_MS,
    });

    return code;
  }

  claim<TPlan>(code: string, fingerprint: string): Claim<TPlan> {
    this.#forgetLapsed();

    const pending = this.#pending.get(code.trim().toUpperCase());
    if (pending === undefined) {
      return { kind: "unknown" };
    }
    if (pending.fingerprint !== fingerprint) {
      // Deliberately NOT spent. The arguments are what is wrong, and burning
      // the code would make the fix a second preview for no reason.
      return { kind: "mismatched" };
    }

    this.#pending.delete(code.trim().toUpperCase());

    return { kind: "confirmed", plan: pending.plan as TPlan };
  }

  #forgetLapsed(): void {
    const now = this.#now();
    for (const [code, pending] of this.#pending) {
      if (pending.expiresAt <= now) {
        this.#pending.delete(code);
      }
    }
  }
}

/**
 * `7KQ2M-9F3BX`: two groups, so it reads as a code rather than as a word a
 * reader might believe it thought of.
 *
 * One alphabet character per random byte. 256 divides by 32 exactly, so the
 * remainder is uniform and no character is likelier than another — which
 * matters only because a mechanism whose whole claim is "this cannot be
 * guessed" should not have a quietly biased generator behind it.
 */
const mintCode = (): string => {
  const characters = [...randomBytes(CODE_BYTES)].map((byte) =>
    CODE_ALPHABET.charAt(byte % CODE_ALPHABET.length),
  );

  return `${characters.slice(0, 5).join("")}-${characters.slice(5).join("")}`;
};
