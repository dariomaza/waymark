import {
  mayViewSpace,
  outermostChoices,
  StorageUnitNotFound,
  unitId,
  WHOLE_REACH,
  type Access,
  type ChosenSpaces,
  type Clock,
  type IdGenerator,
  type StorageUnitRepository,
} from "@waymark/domain";

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
  /** The tree, to check chosen spaces against and to keep the outermost. */
  readonly storageUnits: StorageUnitRepository;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

export interface CreateMachineTokenCommand {
  readonly name: string;
  readonly scope: MachineTokenScope;
  /** The person issuing it, whom it will act as (ADR 26). */
  readonly userId: string;
  /** Absent means it never lapses, which is the normal case. */
  readonly expiresInDays?: number;
  /**
   * Absent means no spaces chosen: the issuer's whole reach (ADR 26). Each
   * space must be one the issuer can see, judged by `issuerAccess`.
   */
  readonly narrowTo?: {
    readonly spaceIds: readonly string[];
    readonly issuerAccess: Access;
  };
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
 * Issues a machine token, from the CLI or from a person's session (ADR 18),
 * optionally narrowed to chosen spaces (ADR 26).
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

    const chosenSpaces = await this.chosenSpacesOf(command.narrowTo);

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
      userId: command.userId,
      createdAt: now,
      expiresAt:
        command.expiresInDays === undefined
          ? null
          : new Date(now.getTime() + command.expiresInDays * DAY_MS),
      lastUsedAt: null,
      chosenSpaces,
    };

    await this.deps.machineTokens.create(machineToken);

    return { token, machineToken };
  }

  /**
   * The spaces a token is narrowed to, as they are kept (ADR 26).
   *
   * A space the issuer cannot see, or that does not exist, is refused with
   * the error a missing space gets, naming the first such in the order given,
   * so the request cannot tell anybody which ids are real. Duplicates are
   * kept once, and a space inside another chosen space is dropped: it adds
   * nothing to the subtree already chosen. An empty list is kept as narrowed
   * to nothing rather than read as "nothing chosen", which would widen it.
   */
  private async chosenSpacesOf(
    narrowTo: CreateMachineTokenCommand["narrowTo"],
  ): Promise<ChosenSpaces> {
    if (narrowTo === undefined) {
      return WHOLE_REACH;
    }

    const tree = await this.deps.storageUnits.findAll();
    const known = new Set(tree.map((unit) => unit.id));
    const requested = narrowTo.spaceIds.map((id) => unitId(id));
    for (const id of requested) {
      if (!known.has(id) || !mayViewSpace(narrowTo.issuerAccess, id)) {
        throw new StorageUnitNotFound(id);
      }
    }

    return { narrowed: true, spaceIds: outermostChoices(requested, tree) };
  }
}
