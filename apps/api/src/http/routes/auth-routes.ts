import type { FastifyPluginAsync } from "fastify";

import type { Login } from "../../auth/login.js";
import type { Logout } from "../../auth/logout.js";
import { bearerTokenOf } from "../bearer-token.js";
import { loginBodySchema } from "../validation.js";
import type { UserView } from "../views.js";

export interface AuthRouteOptions {
  readonly login: Login;
  readonly logout: Logout;
}

/**
 * There is no `POST /auth/register` and there never will be.
 *
 * The API is reachable from the internet through a Cloudflare Tunnel on a real
 * domain. A public sign-up route on a household inventory is not a feature, it
 * is a door. Accounts are created with `pnpm --filter @ariadna/api create-user`
 * by whoever has a shell on the server.
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
  app.get("/auth/me", async (request, reply) => {
    const user: UserView = {
      id: request.caller.user.id,
      username: request.caller.user.username,
    };

    return reply.code(200).send({ user });
  });

  app.post("/auth/logout", async (request, reply) => {
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
