import type {
  PasskeyCeremony,
  PasskeyChallenge,
} from "./passkey-challenge.js";
import type { PasskeyChallengeRepository } from "./passkey-challenge-repository.js";

/**
 * A real, working repository backed by a Map, for use in tests.
 *
 * Measured against the Prisma adapter by the shared contract suite. That
 * matters more here than anywhere else in this codebase: single use is a
 * property of one statement, and a fake that got it right by being
 * single-threaded would be hiding the case the database has to survive.
 */
export class InMemoryPasskeyChallengeRepository
  implements PasskeyChallengeRepository
{
  readonly #challenges = new Map<string, PasskeyChallenge>();

  get size(): number {
    return this.#challenges.size;
  }

  async create(challenge: PasskeyChallenge): Promise<void> {
    this.#challenges.set(challenge.id, challenge);
  }

  /**
   * The read and the delete are one synchronous step with no `await` between
   * them, which is what makes this the same promise the `DELETE` makes: two
   * callers racing the same ceremony cannot both come away with the row.
   *
   * The ceremony and the expiry are conditions here rather than checks
   * afterwards, so a mismatch leaves the row alone — exactly as a `WHERE` that
   * matched nothing does.
   */
  async consume(
    id: string,
    ceremony: PasskeyCeremony,
    now: Date,
  ): Promise<PasskeyChallenge | null> {
    const challenge = this.#challenges.get(id);
    if (
      challenge === undefined ||
      challenge.ceremony !== ceremony ||
      challenge.expiresAt.getTime() <= now.getTime()
    ) {
      return null;
    }

    this.#challenges.delete(id);

    return challenge;
  }

  async deleteExpired(now: Date): Promise<number> {
    const lapsed = [...this.#challenges.values()].filter(
      (challenge) => challenge.expiresAt.getTime() <= now.getTime(),
    );

    for (const challenge of lapsed) {
      this.#challenges.delete(challenge.id);
    }

    return lapsed.length;
  }
}
