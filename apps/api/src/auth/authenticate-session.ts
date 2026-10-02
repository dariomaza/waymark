import type { Clock } from "@waymark/domain";

import { InvalidSession } from "./auth-errors.js";
import {
  SESSION_RENEW_AFTER_MS,
  SESSION_TTL_MS,
  type Session,
} from "./session.js";
import type { SessionRepository } from "./session-repository.js";
import { hashSessionToken } from "./session-token.js";
import { isActive, type User } from "./user.js";
import type { UserRepository } from "./user-repository.js";

export interface AuthenticateSessionDependencies {
  readonly users: UserRepository;
  readonly sessions: SessionRepository;
  readonly clock: Clock;
  readonly sessionTtlMs?: number;
  readonly renewAfterMs?: number;
}

export interface AuthenticatedCaller {
  readonly user: User;
  readonly session: Session;
}

/**
 * Turns a presented token into the caller behind it, or refuses.
 *
 * Unknown, revoked and expired are one single `InvalidSession`: telling a
 * caller that a token used to be valid is free information for whoever stole it.
 */
export class AuthenticateSession {
  constructor(private readonly deps: AuthenticateSessionDependencies) {}

  async execute(token: string): Promise<AuthenticatedCaller> {
    const session = await this.deps.sessions.findByTokenHash(
      hashSessionToken(token),
    );
    if (session === null) {
      throw new InvalidSession();
    }

    const now = this.deps.clock.now();
    if (session.expiresAt.getTime() <= now.getTime()) {
      // Taking the dead row with it, so an abandoned device does not leave a
      // permanent entry in a table that only ever grows.
      await this.deps.sessions.delete(session.id);
      throw new InvalidSession();
    }

    const user = await this.deps.users.findById(session.userId);
    if (user === null) {
      // The account was deleted while the session was alive. The schema
      // cascades, so this is belt and braces rather than an expected path.
      await this.deps.sessions.delete(session.id);
      throw new InvalidSession();
    }

    if (!isActive(user)) {
      // Disabling deletes every session (ADR 26), and this is why that is not
      // trusted to have happened: a disable interrupted between marking the
      // account and deleting its rows leaves a session that must still open
      // nothing. The state decides, and the leftover goes with the refusal.
      await this.deps.sessions.delete(session.id);
      throw new InvalidSession();
    }

    return { user, session: await this.#slide(session, now) };
  }

  /**
   * Pushes the expiry forward, but only once enough of the lifetime has been
   * used. Renewing on every request would make every authenticated read a
   * write on a single SQLite file for no user-visible gain.
   */
  async #slide(session: Session, now: Date): Promise<Session> {
    const ttl = this.deps.sessionTtlMs ?? SESSION_TTL_MS;
    const renewAfter = this.deps.renewAfterMs ?? SESSION_RENEW_AFTER_MS;
    const consumed = ttl - (session.expiresAt.getTime() - now.getTime());

    if (consumed < renewAfter) {
      return session;
    }

    const renewed: Session = {
      ...session,
      expiresAt: new Date(now.getTime() + ttl),
    };
    await this.deps.sessions.save(renewed);

    return renewed;
  }
}
