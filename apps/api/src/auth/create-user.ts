import type { Clock, IdGenerator } from "@ariadna/domain";

import { UsernameAlreadyTaken } from "./auth-errors.js";
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
}

/**
 * Creates an account. Reachable ONLY from the admin CLI.
 *
 * There is no registration route and there never will be: this instance is
 * exposed to the internet through a Cloudflare Tunnel on a real domain, and a
 * public sign-up form on a household inventory is an invitation, not a feature.
 * Accounts are created by whoever has a shell on the server.
 */
export class CreateUser {
  constructor(private readonly deps: CreateUserDependencies) {}

  async execute(command: CreateUserCommand): Promise<User> {
    const username = normalizeUsername(command.username);

    const existing = await this.deps.users.findByUsername(username);
    if (existing !== null) {
      throw new UsernameAlreadyTaken(username);
    }

    const now = this.deps.clock.now();
    const user: User = {
      id: this.deps.ids.next(),
      username,
      passwordHash: await this.deps.hasher.hash(command.password),
      createdAt: now,
      updatedAt: now,
    };

    await this.deps.users.create(user);

    return user;
  }
}
