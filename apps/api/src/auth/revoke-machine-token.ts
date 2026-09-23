import { normalizeMachineTokenName } from "./machine-token.js";
import type { MachineTokenRepository } from "./machine-token-repository.js";

export interface RevokeMachineTokenDependencies {
  readonly machineTokens: MachineTokenRepository;
}

/**
 * Revocation: one named token, gone, on the next request.
 *
 * It is a row deletion for the same reason logout is (ADR 6) — no blocklist to
 * keep, no clock skew, no cache to invalidate. The thing worth saying about it
 * is what it does NOT touch: no human account, no session, no other token. That
 * is the entire reason this credential exists. A machine using somebody's
 * password could only be revoked by changing that person's password, which logs
 * the person out of their own phone to turn off a script.
 */
export class RevokeMachineToken {
  constructor(private readonly deps: RevokeMachineTokenDependencies) {}

  /**
   * `false` when the name named nothing, so the CLI can say so.
   *
   * Deliberately not idempotent-and-silent, unlike logout. Logging out twice is
   * a client retrying; revoking a credential is a person acting on a decision,
   * and "done" in answer to a misspelled name would let them walk away from a
   * token that is still live.
   */
  async execute(name: string): Promise<boolean> {
    return this.deps.machineTokens.deleteByName(normalizeMachineTokenName(name));
  }
}
