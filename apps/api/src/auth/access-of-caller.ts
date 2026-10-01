import {
  narrowAccess,
  resolveAccess,
  userId,
  type Access,
  type ShareRepository,
  type StorageUnitRepository,
} from "@waymark/domain";

import { InvalidMachineToken } from "./auth-errors.js";
import type { Caller } from "./caller.js";
import type { MachineToken } from "./machine-token.js";
import { isActive, type User } from "./user.js";
import type { UserRepository } from "./user-repository.js";

export interface AccessOfCallerDependencies {
  readonly users: UserRepository;
  readonly storageUnits: StorageUnitRepository;
  readonly shares: ShareRepository;
}

/**
 * What a request may see, resolved once, in the hook that identified it
 * (ADR 26).
 *
 * The person is the one behind the caller: the account signed in, or the
 * account that issued the machine token presented. A machine token therefore
 * sees what its issuer sees, narrowed to the spaces chosen for it when any
 * were. Its scope (ADR 17) narrows what it may DO, which is a separate check
 * and is not this one's business.
 *
 * The issuer is read again on every request rather than copied onto the
 * token, so changing a person's role changes what their tokens see at once.
 * A token whose issuer has no account, or a disabled one, is refused as an
 * invalid credential: any access invented for it would be a guess, and the
 * only safe guess is none at all.
 */
export class AccessOfCaller {
  constructor(private readonly deps: AccessOfCallerDependencies) {}

  async execute(caller: Caller): Promise<Access> {
    const person =
      caller.kind === "user" ? caller.user : await this.#issuerOf(caller.machineToken);

    const [storageUnits, shares] = await Promise.all([
      this.deps.storageUnits.findAll(),
      this.deps.shares.findAll(),
    ]);

    const issuers = resolveAccess({
      caller: { userId: userId(person.id), role: person.role },
      storageUnits,
      shares,
    });

    // A token narrowed to chosen spaces reaches its issuer's access within
    // them, and never more (ADR 26). Computed here, on every request, so a
    // share the issuer loses is lost by the token at once.
    return caller.kind === "user"
      ? issuers
      : narrowAccess(issuers, caller.machineToken.chosenSpaces, storageUnits);
  }

  /**
   * The person a token acts as. Disabling an account revokes the tokens it
   * issued (ADR 26); a token that survived that — an interrupted disable — is
   * still refused, because its issuer is read here on every request. A
   * session's own person was already checked when the session was resolved.
   */
  async #issuerOf(token: MachineToken): Promise<User> {
    const issuer = await this.deps.users.findById(token.userId);
    if (issuer === null || !isActive(issuer)) {
      throw new InvalidMachineToken();
    }

    return issuer;
  }
}
