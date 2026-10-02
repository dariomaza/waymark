import type { Session } from "./session.js";

export interface SessionRepository {
  findByTokenHash(tokenHash: string): Promise<Session | null>;

  save(session: Session): Promise<void>;

  /** A no-op when the id is unknown, so logout is idempotent. */
  delete(id: string): Promise<void>;

  /**
   * Signs one person out everywhere: every session of theirs, whichever door
   * opened it. What a password reset and a disable do (ADR 26). Answers how
   * many went.
   */
  deleteAllOf(userId: string): Promise<number>;

  /** Housekeeping for sessions that lapsed without anybody presenting them. */
  deleteExpired(now: Date): Promise<number>;
}
