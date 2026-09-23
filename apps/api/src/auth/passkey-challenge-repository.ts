import type {
  PasskeyCeremony,
  PasskeyChallenge,
} from "./passkey-challenge.js";

/**
 * Where a ceremony in flight is remembered.
 *
 * Small, short-lived rows, in the same SQLite file as everything else, for the
 * reason `PrismaUserRepository` gives: a second store for a handful of rows
 * buys nothing and costs a backup that can drift from the one that matters.
 *
 * It is a port with a contract suite rather than a `Map` in a module for two
 * reasons. A `Map` would be correct today — one process, one container — and
 * would quietly become wrong the day anything runs two. And single use is a
 * property of a STATEMENT here, which is exactly the kind of claim a fake can
 * pass and a database can fail; running one suite against both is what makes
 * the claim mean anything.
 */
export interface PasskeyChallengeRepository {
  create(challenge: PasskeyChallenge): Promise<void>;

  /**
   * Spends a challenge: deletes the row and answers what it deleted, or `null`.
   *
   * ## Why this is one method and not `find` then `delete`
   *
   * Because those two are not one step, and the window between them is exactly
   * the replay this whole table exists to prevent. Two requests arriving with
   * the same `ceremonyId` would both find the row, both verify against it, and
   * both be served — and the second one is by definition the one nobody
   * intended. Here the database decides: one `DELETE` matches, the other
   * matches nothing.
   *
   * ## Why `ceremony` is an argument and not a check afterwards
   *
   * So that it is part of the `WHERE`. A challenge issued for a registration
   * cannot be spent finishing an authentication even if a handler forgot to
   * compare, because the statement does not match the row. A check in a use
   * case is a rule somebody has to remember; a predicate in a delete is a rule
   * that cannot be forgotten.
   *
   * ## Why `now` is an argument
   *
   * Same reason: expiry is part of the same statement, so a challenge that
   * lapsed one millisecond ago is not found rather than found-and-then-judged.
   * The clock is the caller's (the domain's `Clock` port), so a test can move
   * it rather than wait.
   */
  consume(
    id: string,
    ceremony: PasskeyCeremony,
    now: Date,
  ): Promise<PasskeyChallenge | null>;

  /**
   * Housekeeping for ceremonies nobody finished — a cancelled prompt, a closed
   * tab, a phone that went to sleep. Answers how many went.
   *
   * It is called when a new ceremony starts, which is the only path that
   * creates rows here, so the table is swept by the traffic that fills it and
   * there is no timer to own.
   */
  deleteExpired(now: Date): Promise<number>;
}
