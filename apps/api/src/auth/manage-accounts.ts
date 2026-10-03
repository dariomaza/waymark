import { Role, type Clock } from "@waymark/domain";

import {
  AccountNotFound,
  AdministratorOnly,
  LastAdministrator,
  OwnAccount,
} from "./auth-errors.js";
import { mustBeAUsablePassword, type CreateUser } from "./create-user.js";
import type { MachineTokenRepository } from "./machine-token-repository.js";
import type { PasswordHasher } from "./password-hasher.js";
import type { SessionRepository } from "./session-repository.js";
import type { User } from "./user.js";
import {
  LAST_ADMINISTRATOR,
  type GuardedChange,
  type UserRepository,
} from "./user-repository.js";

export interface ManageAccountsDependencies {
  readonly users: UserRepository;
  readonly sessions: SessionRepository;
  readonly machineTokens: MachineTokenRepository;
  /** The very use case the shell drives, so both doors make the same account. */
  readonly createUser: CreateUser;
  readonly hasher: PasswordHasher;
  readonly clock: Clock;
}

export interface NewAccount {
  readonly username: string;
  readonly password: string;
  readonly role: Role;
}

/**
 * # What an administrator may do to the other accounts (ADR 26)
 *
 * Create one, change its role, reset its password, disable it and enable it
 * again. Every method takes `by`, the account making the request as it was
 * read when the request was authenticated, and refuses anybody who is not an
 * administrator before it reads anything else.
 *
 * Accounts are never deleted: one owns an inventory, and deleting it would
 * leave that inventory with nobody. There is no method for it.
 *
 * ## There is always an active administrator, decided in two places
 *
 * **The last one.** Demoting or disabling the last active administrator is
 * refused with `LastAdministrator` (409, ADR 8). That rule lives in the
 * repository, as a condition of the one statement that writes — see
 * `UserRepository.changeRole` — because the realistic way the last one goes
 * is two administrators demoting each other at the same instant, and a count
 * read here before writing would let both through.
 *
 * **Yourself.** An administrator may not demote, disable or reset the
 * password of their OWN account from here; another administrator has to
 * (`OwnAccount`, 409). Not only because it is how the last one disappears with
 * nobody having meant it to: changing your own password should need your
 * current one, which this does not ask for, and a session left open on a
 * borrowed laptop must not be able to lock its owner out. With the caller
 * always an active administrator, this rule means the first one is reached
 * only by the race above — which is exactly the case it exists for.
 */
export class ManageAccounts {
  constructor(private readonly deps: ManageAccountsDependencies) {}

  async list(by: User): Promise<readonly User[]> {
    mustAdminister(by);

    return await this.deps.users.list();
  }

  /** Same normalisation, same minimum and same conflict as the shell. */
  async create(by: User, account: NewAccount): Promise<User> {
    mustAdminister(by);

    return await this.deps.createUser.execute({
      username: account.username,
      password: account.password,
      administrator: account.role === Role.ADMINISTRATOR,
    });
  }

  async changeRole(by: User, accountId: string, role: Role): Promise<User> {
    mustAdminister(by);
    notYourOwn(by, accountId);

    return answered(
      accountId,
      await this.deps.users.changeRole(accountId, role, this.deps.clock.now()),
    );
  }

  /**
   * A new password, and every session of that account goes with the old one.
   * Its passkeys stay (ADR 19): a passkey is a door of its own and resetting
   * a password is not a statement about a device. So do its machine tokens,
   * which are revoked one by one by whoever issued them, or by disabling.
   */
  async resetPassword(by: User, accountId: string, password: string): Promise<User> {
    mustAdminister(by);
    notYourOwn(by, accountId);
    mustBeAUsablePassword(password);

    const changed = await this.deps.users.changePassword(
      accountId,
      await this.deps.hasher.hash(password),
      this.deps.clock.now(),
      false,
    );
    if (changed === null) {
      throw new AccountNotFound(accountId);
    }

    await this.deps.sessions.deleteAllOf(accountId);

    return changed;
  }

  /**
   * Stops the account opening anything, and revokes everything it holds.
   *
   * The account is marked FIRST, then its sessions and machine tokens are
   * deleted. Every way in reads the mark, so if the deletions never happen —
   * a crash between the statements — what is left behind still opens
   * nothing. The other order would leave a window in which a deleted
   * account's credentials were gone but a new sign-in still worked.
   *
   * Its passkeys and its inventory are kept, so enabling it again gives the
   * person back exactly what they had, less the tokens.
   */
  async disable(by: User, accountId: string): Promise<User> {
    mustAdminister(by);
    notYourOwn(by, accountId);

    const disabled = answered(
      accountId,
      await this.deps.users.disable(accountId, this.deps.clock.now()),
    );

    await this.deps.sessions.deleteAllOf(accountId);
    await this.deps.machineTokens.deleteAllIssuedBy(accountId);

    return disabled;
  }

  /** The person can sign in again. Tokens revoked by the disable stay revoked. */
  async enable(by: User, accountId: string): Promise<User> {
    mustAdminister(by);

    const enabled = await this.deps.users.enable(accountId, this.deps.clock.now());
    if (enabled === null) {
      throw new AccountNotFound(accountId);
    }

    return enabled;
  }
}

/**
 * The one check of who may manage accounts. The routes call it too, before
 * a body is parsed, so a refused person learns nothing about its shape.
 */
export const mustAdminister = (by: User): void => {
  if (by.role !== Role.ADMINISTRATOR) {
    throw new AdministratorOnly(by.username);
  }
};

const notYourOwn = (by: User, accountId: string): void => {
  if (by.id === accountId) {
    throw new OwnAccount(accountId);
  }
};

const answered = (accountId: string, change: GuardedChange): User => {
  if (change === null) {
    throw new AccountNotFound(accountId);
  }
  if (change === LAST_ADMINISTRATOR) {
    throw new LastAdministrator(accountId);
  }

  return change;
};
