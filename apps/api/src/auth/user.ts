/**
 * An account: a way in, and nothing else.
 *
 * There is no role, no permission and no owned inventory. Ariadna is one shared
 * inventory, so every authenticated user may do every inventory operation, and
 * `User` lives in `@ariadna/api` rather than in `@ariadna/domain` because
 * "who is allowed in" is not a statement about boxes.
 */
export interface User {
  readonly id: string;
  readonly username: string;
  readonly passwordHash: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Usernames are compared lower case and stored lower case.
 *
 * `Dario` and `dario` being two accounts is a support problem, and doing it
 * with a case insensitive collation would behave differently on SQLite and on
 * the Postgres the README expects one day.
 */
export const normalizeUsername = (raw: string): string =>
  raw.trim().toLowerCase();
