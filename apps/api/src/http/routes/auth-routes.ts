import type { FastifyPluginAsync } from "fastify";

import type { Login } from "../../auth/login.js";
import type { Logout } from "../../auth/logout.js";
import { bearerTokenOf } from "../bearer-token.js";
import { HttpError } from "../http-error.js";
import { machineTokenView, type UserView } from "../views.js";
import { loginBodySchema } from "../validation.js";

export interface AuthRouteOptions {
  readonly login: Login;
  readonly logout: Logout;
}

/**
 * There is no `POST /auth/register` and there never will be.
 *
 * The API is reachable from the internet through a Cloudflare Tunnel on a real
 * domain. A public sign-up route on a household inventory is not a feature, it
 * is a door. Accounts are created with `pnpm --filter @waymark/api create-user`
 * by whoever has a shell on the server.
 *
 * There is no route that mints a machine token either, for the same reason and
 * more so: a machine token is long-lived, so an endpoint that issued one would
 * be a door that does not close by itself. They come from
 * `pnpm --filter @waymark/api machine-token create` (ADR 17).
 */
export const authRoutes: FastifyPluginAsync<AuthRouteOptions> = async (
  app,
  options,
) => {
  app.post("/auth/login", async (request, reply) => {
    const body = loginBodySchema.parse(request.body);

    const result = await options.login.execute({
      username: body.username,
      password: body.password,
      clientIp: request.clientIp,
    });

    const user: UserView = {
      id: result.user.id,
      username: result.user.username,
    };

    return reply.code(200).send({
      token: result.token,
      expiresAt: result.session.expiresAt.toISOString(),
      user,
    });
  });
};

export const authenticatedAuthRoutes: FastifyPluginAsync<AuthRouteOptions> = async (
  app,
  options,
) => {
  /**
   * Who is calling, in the caller's own terms.
   *
   * The two answers do not share a shape, because the two callers are not the
   * same kind of thing. A session answers `{ user }` exactly as it always has —
   * the PWA and the Android app read that key and nothing about them changed.
   * A machine answers `{ machineToken }`, carrying what an operator actually
   * wants to see: which token this is, what it may do, and when it was last
   * used. It never carries `tokenHash`, and `machineTokenView` is where that is
   * guaranteed rather than remembered.
   *
   * Folding a machine into `{ user }` with a made-up username was the obvious
   * alternative and would have been a lie a client could act on: it is not a
   * user, it has no account, and `POST /auth/logout` would then look available.
   */
  app.get("/auth/me", async (request, reply) => {
    if (request.caller.kind === "machine") {
      return reply
        .code(200)
        .send({ machineToken: machineTokenView(request.caller.machineToken) });
    }

    const user: UserView = {
      id: request.caller.user.id,
      username: request.caller.user.username,
    };

    return reply.code(200).send({ user });
  });

  app.post("/auth/logout", async (request, reply) => {
    /**
     * A machine token cannot log itself out.
     *
     * Logout means "delete the session row this request came in on", and a
     * machine token is not a session: there is nothing to delete that would not
     * be the credential itself. Revoking one is a deliberate act by a person
     * with a shell — `machine-token revoke --name` — precisely so that a
     * compromised machine cannot revoke itself into looking innocent, and so
     * that an MCP server with a bug cannot log itself out at three in the
     * morning and be indistinguishable from one that was turned off.
     *
     * 403 rather than 404: the route exists and this caller is authenticated,
     * and it is being refused. A read-only token never reaches this line — the
     * scope hook refused it as a write already.
     */
    if (request.caller.kind === "machine") {
      throw new HttpError(
        403,
        "MACHINE_TOKEN_CANNOT_LOG_OUT",
        "A machine token is revoked from a shell, not by presenting itself",
        { machineTokenName: request.caller.machineToken.name },
      );
    }

    // The hook already proved this header holds a live session, so the token
    // is read again rather than looked up by session id: revocation is keyed
    // by what the client presented.
    const token = bearerTokenOf(request.headers.authorization);
    if (token !== null) {
      await options.logout.execute(token);
    }

    return reply.code(204).send();
  });
};
