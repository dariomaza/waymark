import type { FastifyPluginAsync, FastifyRequest } from "fastify";

import type { User } from "../../auth/user.js";
import type { ManageShares, ShareOfSpaceWith } from "../../sharing/manage-shares.js";
import { HttpError } from "../http-error.js";
import { idParamsSchema, shareBodySchema, shareParamsSchema } from "../validation.js";

export interface ShareRouteOptions {
  readonly manageShares: ManageShares;
}

/** A share as the Share sheet reads it: who, by name, and how far. */
const shareView = (share: ShareOfSpaceWith) => ({
  account: { id: share.account.id, username: share.account.username },
  access: share.access,
});

/**
 * # Sharing a space: the administrator's routes (ADR 26)
 *
 * ```
 * GET    /storage-units/:id/shares               who it is shared with, at which level
 * POST   /storage-units/:id/shares/:accountId    { access: "view" | "edit" }   200
 * DELETE /storage-units/:id/shares/:accountId    204, shared or not
 * ```
 *
 * Under the space, because a share is something said ABOUT a space. Both ids
 * are in the path, so an unknown one is a 404 (ADR 8) and setting a share
 * twice is the same request twice: a share is one row per space and person,
 * and the second replaces the level of the first. `POST` rather than `PUT`
 * because every other change in this API is one, and the CORS allow-list is
 * written for them.
 *
 * | Refusal                       | Status | Why                                                  |
 * | ----------------------------- | ------ | ---------------------------------------------------- |
 * | `MACHINE_TOKEN_CANNOT_SHARE`  | 403    | A machine never hands out access (ADR 18).           |
 * | `ADMINISTRATOR_ONLY`          | 403    | Only an administrator shares (ADR 26).               |
 * | `STORAGE_UNIT_NOT_FOUND`      | 404    | The space in the path is not there.                  |
 * | `ACCOUNT_NOT_FOUND`           | 404    | The account in the path is not there.                |
 * | `ACCOUNT_DISABLED`            | 409    | Enable it first; then the same request succeeds.     |
 * | `ALREADY_HAS_EDIT`            | 409    | The tree's owner, or an administrator.               |
 *
 * ## Why a machine token may do none of this, whatever its scope or issuer
 *
 * ADR 18's reasoning again. A share is access, and a credential that hands
 * out access is a credential that can widen what it, or whoever holds a
 * second one, can reach: an administrator's read-write token could share the
 * whole house with somebody, and nobody would have decided it. Access is
 * handed out by a person, from a screen. So every machine caller is refused
 * with 403, the list included, which a `GET` would otherwise carry past the
 * scope hook.
 */
export const shareRoutes: FastifyPluginAsync<ShareRouteOptions> = async (app, options) => {
  const manage = options.manageShares;

  app.get("/storage-units/:id/shares", async (request, reply) => {
    const by = aPerson(request);
    const { id } = idParamsSchema.parse(request.params);

    return reply.code(200).send({ shares: (await manage.list(by, id)).map(shareView) });
  });

  app.post("/storage-units/:id/shares/:accountId", async (request, reply) => {
    const by = aPerson(request);
    const { id, accountId } = shareParamsSchema.parse(request.params);
    const { access } = shareBodySchema.parse(request.body);

    return reply
      .code(200)
      .send({ share: shareView(await manage.set(by, id, accountId, access)) });
  });

  app.delete("/storage-units/:id/shares/:accountId", async (request, reply) => {
    const by = aPerson(request);
    const { id, accountId } = shareParamsSchema.parse(request.params);

    await manage.remove(by, id, accountId);

    return reply.code(204).send();
  });
};

/**
 * The person behind the session, or a 403 for any machine. Whether that
 * person is an administrator is `ManageShares`' check, made before it reads
 * anything; this one is made before the body is.
 */
const aPerson = (request: FastifyRequest): User => {
  if (request.caller.kind === "user") {
    return request.caller.user;
  }

  throw new HttpError(
    403,
    "MACHINE_TOKEN_CANNOT_SHARE",
    "Spaces are shared by an administrator, never by a machine token",
    { machineTokenName: request.caller.machineToken.name },
  );
};
