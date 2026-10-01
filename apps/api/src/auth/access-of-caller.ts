import {
  resolveAccess,
  userId,
  type Access,
  type ShareRepository,
  type StorageUnitRepository,
} from "@waymark/domain";

import { InvalidMachineToken } from "./auth-errors.js";
import type { Caller } from "./caller.js";
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
 * sees exactly what its issuer sees. Its scope (ADR 17) narrows what it may
 * DO, which is a separate check and is not this one's business.
 *
 * The issuer is read again on every request rather than copied onto the
 * token, so changing a person's role changes what their tokens see at once.
 * A token whose issuer has no account is refused as an invalid credential:
 * any access invented for it would be a guess, and the only safe guess is
 * none at all.
 */
export class AccessOfCaller {
  constructor(private readonly deps: AccessOfCallerDependencies) {}

  async execute(caller: Caller): Promise<Access> {
    const person =
      caller.kind === "user"
        ? caller.user
        : await this.deps.users.findById(caller.machineToken.userId);
    if (person === null) {
      throw new InvalidMachineToken();
    }

    const [storageUnits, shares] = await Promise.all([
      this.deps.storageUnits.findAll(),
      this.deps.shares.findAll(),
    ]);

    return resolveAccess({
      caller: { userId: userId(person.id), role: person.role },
      storageUnits,
      shares,
    });
  }
}
