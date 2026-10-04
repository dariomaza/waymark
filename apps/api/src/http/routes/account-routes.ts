import type { FastifyPluginAsync, FastifyRequest } from "fastify";

import {
  mustAdminister,
  type IssuedAccount,
  type ManageAccounts,
} from "../../auth/manage-accounts.js";
import type { User } from "../../auth/user.js";
import { HttpError } from "../http-error.js";
import {
  changeRoleBodySchema,
  createAccountBodySchema,
  idParamsSchema,
  resetPasswordBodySchema,
} from "../validation.js";
import { accountView } from "../views.js";

export interface AccountRouteOptions {
  readonly manageAccounts: ManageAccounts;
}

/**
 * # The People group's routes: an administrator manages the other accounts
 *
 * ```
 * GET  /auth/accounts                 every account, its role and state
 * POST /auth/accounts                 { username, role }  201 → { account, temporaryPassword }
 * POST /auth/accounts/:id/role        { role }
 * POST /auth/accounts/:id/password    → { account, temporaryPassword }, signs them out everywhere
 * POST /auth/accounts/:id/disable     signs them out, revokes their tokens
 * POST /auth/accounts/:id/enable
 * ```
 *
 * Under `/auth`, beside the machine tokens and the passkeys, because these
 * are credentials and not inventory — and so the web client's namespace
 * (ADR 16) does not lose another first segment. Verbs under the resource, the
 * way rotating a token is, because each is a named act with a consequence
 * rather than a field being patched. There is no `DELETE`: accounts are
 * disabled, never deleted (ADR 26).
 *
 * The first account is still made from a shell. Nothing here is a sign-up:
 * every route is behind an administrator's session.
 *
 * ## Why a machine token may do none of this, whatever its scope or issuer
 *
 * ADR 18's reasoning, one step further. A machine token may not manage
 * machine tokens because a credential that can issue its own successor
 * cannot be revoked; a password is a credential too, and one that opens a
 * PERSON. A read-write token whose issuer happens to be an administrator
 * would otherwise be able to reset a password and sign in as somebody — a
 * program turning itself into a person. So every machine caller is refused
 * here with 403, the list included, which a `GET` would otherwise carry past
 * the scope hook.
 */
export const accountRoutes: FastifyPluginAsync<AccountRouteOptions> = async (
  app,
  options,
) => {
  const manage = options.manageAccounts;

  app.get("/auth/accounts", async (request, reply) => {
    const accounts = await manage.list(administratorOnly(request));

    return reply.code(200).send({ accounts: accounts.map(accountView) });
  });

  app.post("/auth/accounts", async (request, reply) => {
    const by = administratorOnly(request);
    const body = createAccountBodySchema.parse(request.body);

    const issued = await manage.create(by, body);

    return reply.code(201).send(issuedView(issued));
  });

  app.post("/auth/accounts/:id/role", async (request, reply) => {
    const by = administratorOnly(request);
    const { id } = idParamsSchema.parse(request.params);
    const { role } = changeRoleBodySchema.parse(request.body);

    return reply
      .code(200)
      .send({ account: accountView(await manage.changeRole(by, id, role)) });
  });

  app.post("/auth/accounts/:id/password", async (request, reply) => {
    const by = administratorOnly(request);
    const { id } = idParamsSchema.parse(request.params);
    resetPasswordBodySchema.parse(request.body);

    return reply.code(200).send(issuedView(await manage.resetPassword(by, id)));
  });

  app.post("/auth/accounts/:id/disable", async (request, reply) => {
    const by = administratorOnly(request);
    const { id } = idParamsSchema.parse(request.params);

    return reply.code(200).send({ account: accountView(await manage.disable(by, id)) });
  });

  app.post("/auth/accounts/:id/enable", async (request, reply) => {
    const by = administratorOnly(request);
    const { id } = idParamsSchema.parse(request.params);

    return reply.code(200).send({ account: accountView(await manage.enable(by, id)) });
  });
};

/**
 * The one answer that carries a temporary password, sent once (ADR 26,
 * amended). Nothing else ever reads it back: only its hash was stored.
 */
const issuedView = (issued: IssuedAccount) => ({
  account: accountView(issued.account),
  temporaryPassword: issued.temporaryPassword,
});

/**
 * The administrator behind the session, or a 403: for any machine, and for a
 * person who is not an administrator. Before the body is read, so a refused
 * caller learns nothing about the shape of the route.
 */
const administratorOnly = (request: FastifyRequest): User => {
  if (request.caller.kind === "user") {
    mustAdminister(request.caller.user);

    return request.caller.user;
  }

  throw new HttpError(
    403,
    "MACHINE_TOKEN_CANNOT_MANAGE_ACCOUNTS",
    "Accounts are managed by an administrator, never by a machine token",
    { machineTokenName: request.caller.machineToken.name },
  );
};
