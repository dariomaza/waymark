import type { Clock } from "@waymark/domain";

import type { CreatedMachineToken } from "./create-machine-token.js";
import { normalizeMachineTokenName } from "./machine-token.js";
import type { MachineTokenRepository } from "./machine-token-repository.js";
import { issueMachineTokenSecret } from "./machine-token-secret.js";

export interface RotateMachineTokenDependencies {
  readonly machineTokens: MachineTokenRepository;
  readonly clock: Clock;
}

export interface RotateMachineTokenCommand {
  readonly name: string;
  /**
   * Absent means it never lapses, exactly as it does on a creation — and
   * deliberately NOT "keep whatever the old one had".
   *
   * What is stored is an expiry DATE, not the duration somebody chose. Carried
   * forward, every rotation would leave the date where it was while the
   * credential got younger, so a token renewed monthly under a 90-day expiry
   * would quietly reach the day it lapses and stop working the morning after
   * somebody rotated it to make sure it kept working. The duration is asked
   * for again, or there is no expiry.
   */
  readonly expiresInDays?: number;
}

/** The same pair a creation answers with, because that is what this is. */
export type RotatedMachineToken = CreatedMachineToken;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * # A new secret for a credential that already exists, and the death of the old one
 *
 * ## Why this is one operation and not a revoke followed by a create
 *
 * Because the two orders are both wrong, and there is no third.
 *
 * **Revoke, then create** leaves a window in which the name has no credential
 * at all. Every request the machine makes in that window is a 401, which is
 * survivable — but a crash, a dropped connection or a closed laptop inside it
 * is not: the operator has destroyed a live credential and has nothing to put
 * in its place, on the one credential in this system whose whole job is to sit
 * in a compose file on a box they may not be near.
 *
 * **Create, then revoke** cannot even be expressed. The name is unique, so the
 * new secret would have to be issued under a different name — and the name is
 * what revocation is keyed by, what the compose file says, and what the
 * operator knows the thing as.
 *
 * So the repository does it in one statement and this use case does not get to
 * choose an order. See `MachineTokenRepository.rotate`.
 *
 * ## What happens to a request that is already in flight
 *
 * It finishes. Authentication happens once, in the `onRequest` hook, and a
 * request that got a caller out of that hook is holding a value, not a lock on
 * a row; deleting the row underneath it changes nothing about the handler that
 * is already running. `recordLastUsed` is the only thing that would touch the
 * row afterwards, and it is an `updateMany` that shrugs at an id that is no
 * longer there — which the repository contract states outright, because a
 * revoke racing a request was already an ordinary race before rotation
 * existed.
 *
 * Every request that has NOT yet been authenticated when the rotation lands is
 * refused, with the same `InvalidMachineToken` a revoked token gets. There is
 * no grace period in which both secrets work, and there must not be: ADR 6 and
 * ADR 17 both rest on revocation being immediate, and a window in which an old
 * secret still opens the door is a second copy of revocation state — the exact
 * thing ADR 17 refused to cache verified tokens for. Somebody rotating a
 * credential usually believes the old one has leaked, and "it keeps working
 * for another two minutes" is the wrong answer to that.
 *
 * The consequence is real and belongs in the interface rather than in a
 * comment: rotating cuts the machine off until its new secret is in place.
 *
 * ## What it will not do
 *
 * Change the scope. The command has no `scope` field and `MachineTokenRotation`
 * has none either, so a `read` key cannot become a `read-write` one through a
 * door labelled maintenance. Widening a credential is issuing a new one, under
 * a new name, on purpose — and then revoking the old.
 */
export class RotateMachineToken {
  constructor(private readonly deps: RotateMachineTokenDependencies) {}

  /**
   * `null` when the name named nothing.
   *
   * Deliberately not idempotent-and-silent, for the reason `RevokeMachineToken`
   * gives: this is a person acting on a decision, and "done" in answer to a
   * misspelled name lets them walk away believing a secret they still hold has
   * been replaced.
   */
  async execute(
    command: RotateMachineTokenCommand,
  ): Promise<RotatedMachineToken | null> {
    const name = normalizeMachineTokenName(command.name);
    const now = this.deps.clock.now();
    const { token, tokenHash } = issueMachineTokenSecret();

    const machineToken = await this.deps.machineTokens.rotate({
      name,
      tokenHash,
      createdAt: now,
      expiresAt:
        command.expiresInDays === undefined
          ? null
          : new Date(now.getTime() + command.expiresInDays * DAY_MS),
    });

    // The secret generated above is simply dropped when there was nothing to
    // rotate. It was never stored, so there is nothing to undo — and building
    // it before the lookup keeps this one round trip rather than two.
    return machineToken === null ? null : { token, machineToken };
  }
}
