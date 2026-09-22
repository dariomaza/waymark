import { randomBytes } from "node:crypto";

import type { Clock, IdGenerator } from "@waymark/domain";

import { InvalidCredentials, TooManyLoginAttempts } from "./auth-errors.js";
import type { RateLimiter } from "./login-rate-limiter.js";
import type { PasswordHasher } from "./password-hasher.js";
import { SESSION_TTL_MS, type Session } from "./session.js";
import type { SessionRepository } from "./session-repository.js";
import { issueSessionToken } from "./session-token.js";
import { normalizeUsername, type User } from "./user.js";
import type { UserRepository } from "./user-repository.js";

export interface LoginDependencies {
  readonly users: UserRepository;
  readonly sessions: SessionRepository;
  readonly hasher: PasswordHasher;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly rateLimiter: RateLimiter;
  readonly sessionTtlMs?: number;
}

export interface LoginCommand {
  readonly username: string;
  readonly password: string;
  /** Already resolved by `resolveClientIp`; never a raw header. */
  readonly clientIp: string;
}

export interface LoginResult {
  /** Shown to the client exactly once. */
  readonly token: string;
  readonly session: Session;
  readonly user: User;
}

export class Login {
  #decoyHash: Promise<string> | null = null;

  constructor(private readonly deps: LoginDependencies) {}

  async execute(command: LoginCommand): Promise<LoginResult> {
    const decision = this.deps.rateLimiter.check(command.clientIp);
    if (!decision.allowed) {
      // Before any hashing: a memory-hard KDF behind an unlimited endpoint is a
      // denial of service primitive pointed at our own server.
      throw new TooManyLoginAttempts(decision.retryAfterSeconds);
    }

    const username = normalizeUsername(command.username);
    const user = await this.deps.users.findByUsername(username);

    // A password is verified even when there is no user to verify it against.
    // Returning early here would make "unknown user" measurably faster than
    // "wrong password", and that difference alone enumerates every account.
    const encoded = user?.passwordHash ?? (await this.#decoy());
    const matches = await this.deps.hasher.verify(command.password, encoded);

    if (user === null || !matches) {
      this.deps.rateLimiter.recordFailure(command.clientIp);
      throw new InvalidCredentials();
    }

    this.deps.rateLimiter.clear(command.clientIp);

    const now = this.deps.clock.now();
    const { token, tokenHash } = issueSessionToken();
    const session: Session = {
      id: this.deps.ids.next(),
      tokenHash,
      userId: user.id,
      createdAt: now,
      expiresAt: new Date(
        now.getTime() + (this.deps.sessionTtlMs ?? SESSION_TTL_MS),
      ),
    };

    await this.deps.sessions.save(session);

    return { token, session, user };
  }

  /**
   * A hash of a random string nobody will ever type, built once with the very
   * parameters the real hashes use, so verifying against it costs exactly what
   * verifying a real password costs.
   */
  async #decoy(): Promise<string> {
    this.#decoyHash ??= this.deps.hasher.hash(
      randomBytes(32).toString("base64url"),
    );

    return this.#decoyHash;
  }
}
