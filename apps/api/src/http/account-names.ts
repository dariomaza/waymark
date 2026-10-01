import type { Access } from "@waymark/domain";

import type { UserRepository } from "../auth/user-repository.js";

/**
 * # Whose name the tree may carry (ADR 26)
 *
 * An administrator's home screen groups other people's spaces under their
 * names, so the tree carries the owner of each root, by username. Only for an
 * administrator: anybody else reads no name from the tree but their own
 * spaces and what was shared with them.
 *
 * The decision is made here, once, rather than in the route, so no route can
 * hand a person's name to somebody who may not read it. It lives beside
 * `StorageUnitViews` for the same reason that does: a projection that needs a
 * read, kept out of `views.ts`, which is pure.
 */
export class AccountNames {
  constructor(private readonly users: UserRepository) {}

  /** Every account's username by id for an administrator; nothing for anybody else. */
  async visibleTo(access: Access): Promise<ReadonlyMap<string, string>> {
    if (access.kind !== "everything") {
      return new Map();
    }

    return new Map((await this.users.list()).map((user) => [user.id, user.username]));
  }
}
