import { Role, type Clock, type IdGenerator } from "@waymark/domain";

import { InvalidUsername, PasswordTooShort, UsernameAlreadyTaken } from "./auth-errors.js";
import type { PasswordHasher } from "./password-hasher.js";
import { normalizeUsername, type User } from "./user.js";
import type { UserRepository } from "./user-repository.js";

export interface CreateUserDependencies {
  readonly users: UserRepository;
  readonly hasher: PasswordHasher;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

export interface CreateUserCommand {
  readonly username: string;
  readonly password: string;
  /**
   * Makes an administrator of an account that is not the first. The first is
   * always one, asked or not: a deployment has to have somebody who can share.
   */
  readonly administrator?: boolean;
  /**
   * Whether the password is a temporary one the server generated, which the
   * person must replace at their first sign-in (ADR 26, amended). Only the
   * account screen says so; the shell never does, because the operator typed
   * that password and it is already theirs.
   */
  readonly mustChangePassword?: boolean;
}

/**
 * The shortest password any account here may have, wherever it was typed.
 * Every account can be signed in to from the public internet.
 */
export const MINIMUM_PASSWORD_LENGTH = 12;

/** Refuses a password too short to be one here; see `MINIMUM_PASSWORD_LENGTH`. */
export const mustBeAUsablePassword = (password: string): void => {
  if (password.length < MINIMUM_PASSWORD_LENGTH) {
    throw new PasswordTooShort(MINIMUM_PASSWORD_LENGTH);
  }
};

/**
 * Creates an account, from the admin CLI or for an administrator on the
 * account screen (ADR 26) — one use case, so the two doors cannot drift into
 * two sets of rules.
 *
 * There is no registration route and there never will be: this instance is
 * exposed to the internet through a Cloudflare Tunnel on a real domain, and a
 * public sign-up form on a household inventory is an invitation, not a feature.
 * The first account is created by whoever has a shell on the server, and every
 * later one by them or by an administrator they made.
 *
 * The first account on a deployment is the administrator (ADR 26), and every
 * later one is a user unless the command says otherwise.
 */
export class CreateUser {
  constructor(private readonly deps: CreateUserDependencies) {}

  async execute(command: CreateUserCommand): Promise<User> {
    const username = normalizeUsername(command.username);
    if (username.length === 0) {
      throw new InvalidUsername();
    }
    mustBeAUsablePassword(command.password);

    const existing = await this.deps.users.findByUsername(username);
    if (existing !== null) {
      throw new UsernameAlreadyTaken(username);
    }

    const first = !(await this.deps.users.anyoneExists());
    const now = this.deps.clock.now();
    const user: User = {
      id: this.deps.ids.next(),
      username,
      passwordHash: await this.deps.hasher.hash(command.password),
      role:
        first || command.administrator === true ? Role.ADMINISTRATOR : Role.USER,
      createdAt: now,
      updatedAt: now,
      disabledAt: null,
      mustChangePassword: command.mustChangePassword === true,
    };

    await this.deps.users.create(user);

    return user;
  }
}
