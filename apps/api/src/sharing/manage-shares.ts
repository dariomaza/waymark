import {
  ownerOfTreeHolding,
  Role,
  StorageUnitNotFound,
  unitId,
  userId,
  type ShareLevel,
  type ShareRepository,
  type StorageUnit,
  type StorageUnitRepository,
} from "@waymark/domain";

import {
  AccountDisabled,
  AccountNotFound,
  AdministratorOnly,
  AlreadyHasEdit,
} from "../auth/auth-errors.js";
import { isActive, type User } from "../auth/user.js";
import type { UserRepository } from "../auth/user-repository.js";

export interface ManageSharesDependencies {
  readonly users: UserRepository;
  readonly storageUnits: StorageUnitRepository;
  readonly shares: ShareRepository;
}

/** One person a space is shared with, and how far. */
export interface ShareOfSpaceWith {
  readonly account: User;
  readonly access: ShareLevel;
}

/**
 * # The administrator shares a space (ADR 26)
 *
 * Only an administrator shares: list who a space is shared with, share it
 * with a person at view or edit, and stop. A share covers everything under
 * the space, and where shares overlap the most permissive one wins; both are
 * `resolveAccess`'s business, not this one's.
 *
 * Every method takes `by`, the account making the request, and refuses
 * anybody who is not an administrator before it reads anything else. The
 * space is then looked up as an administrator sees it, which is everything.
 *
 * ## Who a space is never shared with
 *
 * Its tree's owner, and an administrator: both already have edit, so a share
 * could only appear to lower that and never would (`AlreadyHasEdit`). And a
 * disabled account (`AccountDisabled`), which opens nothing. Stopping a share
 * is refused for none of them, so whatever is left behind can be cleaned up.
 */
export class ManageShares {
  constructor(private readonly deps: ManageSharesDependencies) {}

  /** Shares placed on this space itself, by username, never those above it. */
  async list(by: User, spaceId: string): Promise<readonly ShareOfSpaceWith[]> {
    mustShare(by);
    const space = await this.#space(spaceId);

    const [shares, accounts] = await Promise.all([
      this.deps.shares.findAll(),
      this.deps.users.list(),
    ]);
    const byId = new Map(accounts.map((account) => [account.id, account]));

    return shares
      .filter((share) => share.storageUnitId === space.id)
      .flatMap((share) => {
        const account = byId.get(share.userId);

        return account === undefined ? [] : [{ account, access: share.access }];
      })
      .sort((left, right) => left.account.username.localeCompare(right.account.username, "en"));
  }

  /** Shares the space with the person at `access`, replacing any level they had. */
  async set(
    by: User,
    spaceId: string,
    accountId: string,
    access: ShareLevel,
  ): Promise<ShareOfSpaceWith> {
    mustShare(by);
    const space = await this.#space(spaceId);
    const account = await this.#account(accountId);

    if (!isActive(account)) {
      throw new AccountDisabled(account.id);
    }
    if (account.role === Role.ADMINISTRATOR) {
      throw new AlreadyHasEdit(account.id, "administrator");
    }
    if ((await ownerOfTreeHolding(this.deps.storageUnits, space)) === account.id) {
      throw new AlreadyHasEdit(account.id, "owner");
    }

    await this.deps.shares.set({ storageUnitId: space.id, userId: userId(account.id), access });

    return { account, access };
  }

  /** Stops sharing the space with the person. Not shared already is not an error. */
  async remove(by: User, spaceId: string, accountId: string): Promise<void> {
    mustShare(by);
    const space = await this.#space(spaceId);
    const account = await this.#account(accountId);

    await this.deps.shares.remove(space.id, userId(account.id));
  }

  async #space(id: string): Promise<StorageUnit> {
    const space = await this.deps.storageUnits.findById(unitId(id));
    if (space === null) {
      throw new StorageUnitNotFound(unitId(id));
    }

    return space;
  }

  async #account(id: string): Promise<User> {
    const account = await this.deps.users.findById(id);
    if (account === null) {
      throw new AccountNotFound(id);
    }

    return account;
  }
}

/** The one check of who may share. */
const mustShare = (by: User): void => {
  if (by.role !== Role.ADMINISTRATOR) {
    throw new AdministratorOnly(by.username, "shares spaces");
  }
};
