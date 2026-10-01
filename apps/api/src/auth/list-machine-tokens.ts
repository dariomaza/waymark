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
}

export interface ListedMachineToken {
  readonly machineToken: MachineToken;
  /**
   * The issuer's username, for whoever may see other people's tokens: an
   * administrator or the shell. `null` for a person listing their own, where
   * the answer would always be them.
   */
  readonly issuedBy: string | null;
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

  async execute(by: MachineTokenManager): Promise<ListedMachineToken[]> {
    const visible = (await this.deps.machineTokens.list()).filter((token) =>
      mayManageMachineToken(by, token),
    );

    if (tokensManagedBy(by) !== ANY_ISSUER) {
      return visible.map((machineToken) => ({ machineToken, issuedBy: null }));
    }

    const usernames = new Map<string, string | null>();
    for (const userId of new Set(visible.map((token) => token.userId))) {
      usernames.set(userId, (await this.deps.users.findById(userId))?.username ?? null);
    }

    return visible.map((machineToken) => ({
      machineToken,
      issuedBy: usernames.get(machineToken.userId) ?? null,
    }));
  }
}
