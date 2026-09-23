import type { Clock } from "@waymark/domain";

import { InvalidMachineToken } from "./auth-errors.js";
import {
  LAST_USED_GRANULARITY_MS,
  type MachineToken,
} from "./machine-token.js";
import type { MachineTokenRepository } from "./machine-token-repository.js";
import {
  hashMachineTokenSecret,
  looksLikeMachineToken,
} from "./machine-token-secret.js";

export interface AuthenticateMachineTokenDependencies {
  readonly machineTokens: MachineTokenRepository;
  readonly clock: Clock;
  readonly lastUsedGranularityMs?: number;
}

/**
 * Turns a presented machine token into the credential behind it, or refuses.
 *
 * The sibling of `AuthenticateSession`, and deliberately NOT a branch inside
 * it: the two read different tables, and a single use case that tried both
 * would be the exact replay hazard the separate `Authorization` scheme exists
 * to remove. Which of the two runs is decided at the transport, once, before
 * either table is touched.
 */
export class AuthenticateMachineToken {
  constructor(private readonly deps: AuthenticateMachineTokenDependencies) {}

  async execute(token: string): Promise<MachineToken> {
    // Structure first, so a string that was never a machine token — a stolen
    // session token, a truncated copy-paste out of a compose file — is refused
    // without a query.
    if (!looksLikeMachineToken(token)) {
      throw new InvalidMachineToken();
    }

    const machineToken = await this.deps.machineTokens.findByTokenHash(
      hashMachineTokenSecret(token),
    );
    if (machineToken === null) {
      throw new InvalidMachineToken();
    }

    const now = this.deps.clock.now();
    if (
      machineToken.expiresAt !== null &&
      machineToken.expiresAt.getTime() <= now.getTime()
    ) {
      // The row STAYS, unlike an expired session's.
      //
      // `AuthenticateSession` deletes a lapsed session because nobody ever
      // reads that table and an abandoned device would otherwise leave a row
      // for ever. This table is read by a person, with `machine-token list`,
      // and the question they arrive with is "why did the MCP server stop
      // working". "There is no such token" is a worse answer to that than "it
      // lapsed on the 3rd", and it invites them to mint a second one while the
      // first is still in a compose file somewhere.
      throw new InvalidMachineToken();
    }

    return this.#recordUse(machineToken, now);
  }

  /**
   * Stamps `lastUsedAt`, but only once the recorded value is stale enough to be
   * worth a write.
   *
   * This is `AuthenticateSession`'s sliding-renewal throttle, pointed at a
   * harder version of the same problem: a machine is the one caller that reads
   * in a loop, so an unthrottled stamp would turn an assistant walking a forty
   * box inventory into forty writes on a single SQLite file. See
   * `LAST_USED_GRANULARITY_MS` for why the window is an hour rather than the
   * session's day.
   */
  async #recordUse(
    machineToken: MachineToken,
    now: Date,
  ): Promise<MachineToken> {
    const granularity =
      this.deps.lastUsedGranularityMs ?? LAST_USED_GRANULARITY_MS;
    const recorded = machineToken.lastUsedAt;

    if (
      recorded !== null &&
      now.getTime() - recorded.getTime() < granularity
    ) {
      return machineToken;
    }

    await this.deps.machineTokens.recordLastUsed(machineToken.id, now);

    return { ...machineToken, lastUsedAt: now };
  }
}
