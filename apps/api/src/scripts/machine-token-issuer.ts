import { normalizeUsername, type User } from "../auth/user.js";
import type { UserRepository } from "../auth/user-repository.js";

/** `--username` named an account that does not exist. */
export class IssuerNotFound extends Error {
  constructor(readonly username: string) {
    super(`There is no account named "${username}" to issue this token for.`);
    this.name = "IssuerNotFound";
  }
}

/** Nobody was named, and there is no administrator to default to. */
export class NoAdministratorToIssueFor extends Error {
  constructor() {
    super(
      "A machine token belongs to a person, and there is no administrator to " +
        "issue it for. Create the first account with create-user, or name one " +
        "with --username.",
    );
    this.name = "NoAdministratorToIssueFor";
  }
}

/**
 * Whom a machine token issued from the shell belongs to (ADR 26).
 *
 * The person `--username` names, or, when nobody is named, the oldest
 * administrator: the shell is the administrator's tool, and the first token on
 * a fresh install is made before anybody has signed in to make it from the
 * account screen. With no administrator at all it refuses rather than guess,
 * because a token acts as whoever it belongs to.
 */
export const resolveMachineTokenIssuer = async (
  users: UserRepository,
  username: string | null,
): Promise<User> => {
  if (username !== null) {
    const named = await users.findByUsername(normalizeUsername(username));
    if (named === null) {
      throw new IssuerNotFound(username);
    }
    return named;
  }

  const administrator = await users.findOldestAdministrator();
  if (administrator === null) {
    throw new NoAdministratorToIssueFor();
  }
  return administrator;
};
