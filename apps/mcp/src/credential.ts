import { isMachineCaller, mayWriteWith } from "@waymark/api-client";

import type { McpApiClient } from "./waymark.js";

export interface WriteAbility {
  readonly allowed: boolean;
  /** What the operator called this credential. A name, never a secret. */
  readonly tokenName: string;
}

/**
 * # Asking the credential what it may do, instead of finding out by failing
 *
 * A read-only machine token is refused every write by the API, in the hook
 * that authenticated it, before the body is parsed (ADR 17). That is the
 * guarantee and it is not negotiable from out here.
 *
 * But "Waymark answered 403" is a terrible thing to put in front of somebody
 * who asked to file a soldering iron away, and it is worse than terrible when
 * it arrives AFTER a confirmation step that made it look as though the write
 * was about to happen. So this server asks first. `GET /auth/me` answers a
 * machine token's name and scope, which is precisely the question, and the
 * write tools refuse with a sentence of their own before they preview
 * anything.
 *
 * The answer is cached for the life of the process because a token's scope
 * cannot change: there is no route that edits one, and revoking it deletes the
 * row — after which the next request of any kind is a 401 with its own
 * sentence. Caching a SCOPE is not caching a credential's validity, which is
 * the thing ADR 17 refuses to cache.
 */
export const writeAbilityOf = (client: McpApiClient): (() => Promise<WriteAbility>) => {
  let known: WriteAbility | null = null;

  return async (): Promise<WriteAbility> => {
    if (known !== null) {
      return known;
    }

    const caller = await client.me();

    known = isMachineCaller(caller)
      ? {
          allowed: mayWriteWith(caller.machineToken.scope),
          tokenName: caller.machineToken.name,
        }
      : // Not a machine at all, which this server cannot arrange and does not
        // pretend to understand. Let the API be the one to decide.
        { allowed: true, tokenName: "this credential" };

    return known;
  };
};
