import type { Clock } from "@waymark/domain";

import {
  CurrentPasswordRequired,
  InvalidCredentials,
  InvalidSession,
  PasswordUnchanged,
  TooManyLoginAttempts,
} from "./auth-errors.js";
import { mustBeAUsablePassword } from "./create-user.js";
import type { RateLimiter } from "./login-rate-limiter.js";
import type { PasswordHasher } from "./password-hasher.js";
import type { SessionRepository } from "./session-repository.js";
import type { User } from "./user.js";
import type { UserRepository } from "./user-repository.js";

export interface ChangeOwnPasswordDependencies {
  readonly users: UserRepository;
  readonly sessions: SessionRepository;
  readonly hasher: PasswordHasher;
  readonly clock: Clock;
  /** The sign-in limiter itself: a wrong current password is a wrong password. */
  readonly rateLimiter: RateLimiter;
}

export interface ChangeOwnPasswordCommand {
  /** The account as it was read when this request was authenticated. */
  readonly user: User;
  /** The session the request came in on: the one that stays signed in. */
  readonly sessionId: string;
  readonly password: string;
  /** Required unless the account's password is a temporary one. */
  readonly currentPassword?: string | undefined;
  /** Already resolved by `resolveClientIp`; never a raw header. */
  readonly clientIp: string;
}

/**
 * # A person chooses their own password (ADR 26, amended)
 *
 * Anybody signed in may, at any time; with a temporary password it is the
 * one thing they may do.
 *
 * ## When the current password is asked for
 *
 * Not when the account's password is temporary. The person signed in with it
 * moments ago, it was generated for exactly this, and asking for it again
 * would only send them back to the administrator's screen to read it twice.
 *
 * Otherwise always. A session left open on a borrowed laptop must not be
 * able to lock its owner out, so a wrong current password is refused exactly
 * as a sign-in refuses one — `InvalidCredentials`, after the same hashing —
 * and counted by the very limiter the sign-in uses, so this route is not a
 * second, unlimited door for guessing.
 *
 * ## What it ends
 *
 * Every OTHER session of the person: whoever else was signed in with the old
 * password is not any more. The session in use stays, so the person who just
 * chose a password is not sent to the sign-in screen to type it again.
 * Passkeys and machine tokens stay, as they do through a reset (ADR 19, 26).
 */
export class ChangeOwnPassword {
  constructor(private readonly deps: ChangeOwnPasswordDependencies) {}

  async execute(command: ChangeOwnPasswordCommand): Promise<User> {
    const { user } = command;
    mustBeAUsablePassword(command.password);

    if (!user.mustChangePassword) {
      await this.#mustKnowTheCurrentOne(user, command);
    }

    // A new password equal to the old one changes nothing, and with a
    // temporary one it would keep the very password the administrator saw.
    if (await this.deps.hasher.verify(command.password, user.passwordHash)) {
      throw new PasswordUnchanged();
    }

    const changed = await this.deps.users.changePassword(
      user.id,
      await this.deps.hasher.hash(command.password),
      this.deps.clock.now(),
      false,
    );
    if (changed === null) {
      // Authenticated a moment ago, and accounts are never deleted: only a
      // database edited by hand gets here. Answered as a stale session.
      throw new InvalidSession();
    }

    await this.deps.sessions.deleteAllOfExcept(user.id, command.sessionId);

    return changed;
  }

  async #mustKnowTheCurrentOne(user: User, command: ChangeOwnPasswordCommand): Promise<void> {
    if (command.currentPassword === undefined) {
      throw new CurrentPasswordRequired();
    }

    const decision = this.deps.rateLimiter.check(command.clientIp);
    if (!decision.allowed) {
      throw new TooManyLoginAttempts(decision.retryAfterSeconds);
    }

    if (!(await this.deps.hasher.verify(command.currentPassword, user.passwordHash))) {
      this.deps.rateLimiter.recordFailure(command.clientIp);
      throw new InvalidCredentials();
    }

    this.deps.rateLimiter.clear(command.clientIp);
  }
}
