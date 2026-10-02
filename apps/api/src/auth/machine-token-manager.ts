import { Role } from "@waymark/domain";

import type { MachineToken } from "./machine-token.js";
import { ANY_ISSUER, type IssuedBy } from "./machine-token-repository.js";

/**
 * Who is listing, rotating or revoking machine tokens (ADR 26).
 *
 * A person from the account screen, or the shell. The shell is whoever holds
 * the server, which is how the first token on a fresh install is made, so it
 * manages every token, as an administrator does.
 */
export type MachineTokenManager =
  | { readonly kind: "shell" }
  | {
      readonly kind: "person";
      readonly userId: string;
      readonly role: Role;
    };

export const THE_SHELL: MachineTokenManager = { kind: "shell" };

/**
 * Whose tokens a manager may touch: an administrator and the shell, anybody's;
 * everybody else, their own. ADR 18's argument that everyone who could mint a
 * token should see it still holds: only an administrator can mint one in
 * somebody else's name.
 */
export const tokensManagedBy = (manager: MachineTokenManager): IssuedBy =>
  manager.kind === "shell" || manager.role === Role.ADMINISTRATOR
    ? ANY_ISSUER
    : manager.userId;

/** Whether a manager may see and change this one token. */
export const mayManageMachineToken = (
  manager: MachineTokenManager,
  token: Pick<MachineToken, "userId">,
): boolean => {
  const issuedBy = tokensManagedBy(manager);

  return issuedBy === ANY_ISSUER || token.userId === issuedBy;
};
