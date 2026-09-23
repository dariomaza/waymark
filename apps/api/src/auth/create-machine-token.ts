import type { Clock, IdGenerator } from "@waymark/domain";

import {
  InvalidMachineTokenName,
  MachineTokenNameAlreadyTaken,
} from "./auth-errors.js";
import {
  normalizeMachineTokenName,
  type MachineToken,
  type MachineTokenScope,
} from "./machine-token.js";
import type { MachineTokenRepository } from "./machine-token-repository.js";
import { issueMachineTokenSecret } from "./machine-token-secret.js";

export interface CreateMachineTokenDependencies {
  readonly machineTokens: MachineTokenRepository;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

export interface CreateMachineTokenCommand {
  readonly name: string;
  readonly scope: MachineTokenScope;
  /** Absent means it never lapses, which is the normal case. */
  readonly expiresInDays?: number;
}

export interface CreatedMachineToken {
  /**
   * Printed by the CLI exactly once and never recoverable.
   *
   * Not because showing it twice would be technically hard — the hash makes it
   * impossible, which is the point. A credential the server can re-read is a
   * credential a stolen database hands over.
   */
  readonly token: string;
  readonly machineToken: MachineToken;
}

/**
 * A name somebody has to be able to type into a shell, in a hurry, correctly.
 *
 * Lower case because the name is normalized to it; no spaces, no slashes, no
 * shell metacharacters, and nothing outside ASCII — `café` and `cafe` look
 * identical in half the terminals in the world and are different strings in all
 * of them, which is not a property to want in the argument that revokes a
 * credential.
 */
const USABLE_NAME = /^[a-z0-9][a-z0-9._-]*$/u;

const MAX_NAME_LENGTH = 100;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Issues a machine token. Reachable ONLY from the admin CLI.
 *
 * There is no route for this and there never will be, for the reason
 * `CreateUser` gives about accounts: this API is on the public internet through
 * a tunnel, and an endpoint that mints long-lived credentials is a door. A
 * machine token is created by whoever has a shell on the server, exactly as an
 * account is.
 */
export class CreateMachineToken {
  constructor(private readonly deps: CreateMachineTokenDependencies) {}

  async execute(
    command: CreateMachineTokenCommand,
  ): Promise<CreatedMachineToken> {
    const name = normalizeMachineTokenName(command.name);
    if (!USABLE_NAME.test(name) || name.length > MAX_NAME_LENGTH) {
      throw new InvalidMachineTokenName(command.name);
    }

    // Checked here so the CLI can say something useful, and enforced again by
    // the unique index underneath — which is the one that actually decides,
    // because this read and the write below are not one transaction.
    if ((await this.deps.machineTokens.findByName(name)) !== null) {
      throw new MachineTokenNameAlreadyTaken(name);
    }

    const now = this.deps.clock.now();
    const { token, tokenHash } = issueMachineTokenSecret();
    const machineToken: MachineToken = {
      id: this.deps.ids.next(),
      name,
      tokenHash,
      scope: command.scope,
      createdAt: now,
      expiresAt:
        command.expiresInDays === undefined
          ? null
          : new Date(now.getTime() + command.expiresInDays * DAY_MS),
      lastUsedAt: null,
    };

    await this.deps.machineTokens.create(machineToken);

    return { token, machineToken };
  }
}
