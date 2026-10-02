import {
  mayViewSpace,
  type Access,
  type StorageUnitRepository,
  type UnitId,
} from "@waymark/domain";

import type { MachineToken } from "./machine-token.js";
import {
  mayManageMachineToken,
  tokensManagedBy,
  type MachineTokenManager,
} from "./machine-token-manager.js";
import { ANY_ISSUER, type MachineTokenRepository } from "./machine-token-repository.js";
import type { UserRepository } from "./user-repository.js";

export interface ListMachineTokensDependencies {
  readonly machineTokens: MachineTokenRepository;
  readonly users: UserRepository;
  readonly storageUnits: StorageUnitRepository;
}

/** A chosen space, as a list row names it. */
export interface NamedSpace {
  readonly id: UnitId;
  readonly name: string;
}

export interface ListedMachineToken {
  readonly machineToken: MachineToken;
  /**
   * The issuer's username, for whoever may see other people's tokens: an
   * administrator or the shell. `null` for a person listing their own, where
   * the answer would always be them.
   */
  readonly issuedBy: string | null;
  /**
   * The spaces it was narrowed to, by name; `null` when none were chosen
   * (ADR 26). Only those the person listing may see are named, so a list
   * never carries the name of a space somebody has lost: for the issuer
   * that is also exactly what the token still reaches.
   */
  readonly spaces: readonly NamedSpace[] | null;
}

/**
 * The tokens a manager may see (ADR 26): a person, the ones they issued; an
 * administrator and the shell, all of them, each with whose it is.
 *
 * Filtered here rather than in a query because a house holds a handful of
 * tokens, and the rule then sits in one function beside rotation's and
 * revocation's (`mayManageMachineToken`).
 */
export class ListMachineTokens {
  constructor(private readonly deps: ListMachineTokensDependencies) {}

  /** `sees` is the access of whoever is listing, which decides which names show. */
  async execute(by: MachineTokenManager, sees: Access): Promise<ListedMachineToken[]> {
    const visible = (await this.deps.machineTokens.list()).filter((token) =>
      mayManageMachineToken(by, token),
    );
    const spacesOf = await this.namer(sees);

    if (tokensManagedBy(by) !== ANY_ISSUER) {
      return visible.map((machineToken) => ({
        machineToken,
        issuedBy: null,
        spaces: spacesOf(machineToken),
      }));
    }

    const usernames = new Map<string, string | null>();
    for (const userId of new Set(visible.map((token) => token.userId))) {
      usernames.set(userId, (await this.deps.users.findById(userId))?.username ?? null);
    }

    return visible.map((machineToken) => ({
      machineToken,
      issuedBy: usernames.get(machineToken.userId) ?? null,
      spaces: spacesOf(machineToken),
    }));
  }

  private async namer(
    sees: Access,
  ): Promise<(token: MachineToken) => readonly NamedSpace[] | null> {
    const names = new Map(
      (await this.deps.storageUnits.findAll()).map((unit) => [unit.id, unit.name]),
    );

    return (token) => {
      if (!token.chosenSpaces.narrowed) {
        return null;
      }

      return token.chosenSpaces.spaceIds
        .filter((id) => names.has(id) && mayViewSpace(sees, id))
        .map((id) => ({ id, name: names.get(id) as string }))
        .sort((left, right) => left.name.localeCompare(right.name));
    };
  }
}
