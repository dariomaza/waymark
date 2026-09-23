import type { MachineToken } from "./machine-token.js";

/**
 * Where machine tokens are kept.
 *
 * A port beside `SessionRepository` and `UserRepository`, in `@waymark/api`
 * rather than in `@waymark/domain`, for the reason `user.ts` gives: who is
 * allowed in is not a statement about boxes. Unlike those two, this one comes
 * with a shared contract suite — see `machine-token-repository.contract.ts`.
 */
export interface MachineTokenRepository {
  /**
   * The read on the request path, and the only one that has to be fast.
   *
   * It is a lookup by hash and NOT a scan-and-compare, which is the property
   * that lets the stored digest be a plain SHA-256: the unique index decides
   * equality inside the database, so no digest of ours is ever compared byte by
   * byte in application code and there is no timing signal to leak. An adapter
   * that answered this by walking rows would be a different, worse port.
   */
  findByTokenHash(tokenHash: string): Promise<MachineToken | null>;

  /** The name must already be normalized; see `normalizeMachineTokenName`. */
  findByName(name: string): Promise<MachineToken | null>;

  /** Rejects when the name is taken. The unique index decides, not a read. */
  create(token: MachineToken): Promise<void>;

  /**
   * Stamps `lastUsedAt`, and nothing else.
   *
   * A no-op for an id that is not there, because a token revoked while one of
   * its requests was in flight is an ordinary race and not a 500.
   */
  recordLastUsed(id: string, at: Date): Promise<void>;

  /**
   * Revocation. `true` when a token went, `false` when the name named nothing —
   * so the CLI can tell "revoked" from "there was nothing to revoke" rather
   * than reporting success at a typo.
   */
  deleteByName(name: string): Promise<boolean>;

  /** Every token, by name, for the CLI. Never the secret; there is none stored. */
  list(): Promise<readonly MachineToken[]>;
}
