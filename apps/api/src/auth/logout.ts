import type { SessionRepository } from "./session-repository.js";
import { hashSessionToken } from "./session-token.js";

export interface LogoutDependencies {
  readonly sessions: SessionRepository;
}

/**
 * Revocation is a row deletion, which is the whole argument for opaque tokens
 * over a JWT: it takes effect on the next request, everywhere, with no
 * blocklist to keep and no clock skew to reason about.
 */
export class Logout {
  constructor(private readonly deps: LogoutDependencies) {}

  /** Idempotent: logging out twice, or with a made up token, is not an error. */
  async execute(token: string): Promise<void> {
    const session = await this.deps.sessions.findByTokenHash(
      hashSessionToken(token),
    );
    if (session === null) {
      return;
    }

    await this.deps.sessions.delete(session.id);
  }
}
