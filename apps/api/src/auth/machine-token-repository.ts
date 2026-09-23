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
   * A new secret behind a name that is already taken, in ONE statement.
   *
   * ## Why this is a port method and not `deleteByName` then `create`
   *
   * Because those two are not one step, and there is no order of them that is
   * safe. Delete first and there is a window in which the name has no
   * credential at all — and if the process dies in that window, the operator
   * has destroyed a live token and has nothing to put in its place, on the one
   * credential whose whole job is to be in a compose file. Create first is not
   * even possible: the name is unique, so it would have to be created under a
   * different name, and the name is what revocation is keyed by.
   *
   * One statement removes the question. The row is replaced or it is not.
   *
   * ## What it keeps, and what it must not
   *
   * `name`, `scope` and `id` survive — this is the same credential slot, and
   * an operator addressing it by name must still find it there. The secret is
   * new by definition, and `lastUsedAt` MUST go back to `null`: it is the one
   * field that says whether anything is still using this credential, and
   * carrying it across a rotation would have it report a use that happened
   * before the secret it describes existed.
   *
   * `null` when the name named nothing, for the same reason `deleteByName`
   * answers `false`: rotating a credential is a person acting on a decision,
   * and success in answer to a typo lets them walk away believing a secret
   * they still hold has been replaced.
   */
  rotate(rotation: MachineTokenRotation): Promise<MachineToken | null>;

  /**
   * Revocation. `true` when a token went, `false` when the name named nothing —
   * so the CLI can tell "revoked" from "there was nothing to revoke" rather
   * than reporting success at a typo.
   */
  deleteByName(name: string): Promise<boolean>;

  /** Every token, by name, for the CLI. Never the secret; there is none stored. */
  list(): Promise<readonly MachineToken[]>;
}

/**
 * Everything a rotation replaces, which is deliberately not everything.
 *
 * `name` addresses the row; `scope` is absent because a rotation issues a new
 * secret for the SAME key, and a rotation that could widen `read` into
 * `read-write` would be a way to escalate a credential while calling it
 * maintenance.
 */
export interface MachineTokenRotation {
  readonly name: string;
  readonly tokenHash: string;
  readonly createdAt: Date;
  /** Fresh, and never carried over: see `RotateMachineToken`. */
  readonly expiresAt: Date | null;
}
