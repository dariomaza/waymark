import type { FastifyPluginAsync, FastifyRequest } from "fastify";

import type { CreateMachineToken } from "../../auth/create-machine-token.js";
import type { ListMachineTokens } from "../../auth/list-machine-tokens.js";
import type { MachineTokenScope } from "../../auth/machine-token.js";
import type { MachineTokenManager } from "../../auth/machine-token-manager.js";
import type { RevokeMachineToken } from "../../auth/revoke-machine-token.js";
import type { RotateMachineToken } from "../../auth/rotate-machine-token.js";
import type { User } from "../../auth/user.js";
import { HttpError } from "../http-error.js";
import {
  createMachineTokenBodySchema,
  machineTokenNameParamsSchema,
  rotateMachineTokenBodySchema,
} from "../validation.js";
import { machineTokenView } from "../views.js";

export interface MachineTokenRouteOptions {
  readonly listMachineTokens: ListMachineTokens;
  readonly createMachineToken: CreateMachineToken;
  readonly rotateMachineToken: RotateMachineToken;
  readonly revokeMachineToken: RevokeMachineToken;
}

/**
 * # Managing machine tokens from the account screen
 *
 * ADR 17 said there would never be a route that mints one of these, and it was
 * right about the danger: an endpoint that issues a LONG-LIVED credential on an
 * internet-facing inventory is a door that does not close by itself. ADR 18
 * reopens it and adds the word that sentence was missing — WHO. Every route
 * here is behind a person's session, which is password backed, rate limited
 * (ADR 7) and revocable in one `DELETE` (ADR 6). It is not a self-service door
 * and it is not a public one.
 *
 * The CLI is untouched and stays the way the FIRST token is made, before
 * anybody can log in at all.
 *
 * ## Why a machine token may not do any of this
 *
 * The short version is the coordinator's: a `read` key that can mint a
 * `read-write` key is read-only in name only. That case is already closed
 * before these handlers run — a create, a rotate and a revoke are all writes,
 * so `build-app.ts`'s scope hook refuses a read-scoped token with 403 before
 * the body is parsed.
 *
 * The case that needs an argument is the READ-WRITE token, which passes that
 * hook cleanly. It is refused here, and the reason is revocation.
 *
 * 1. **A credential that can issue its own successor cannot be revoked.**
 *    Revoking `mcp-server` is supposed to mean the thing holding it is out.
 *    If it could mint `mcp-server-2` last Tuesday, revoking `mcp-server`
 *    removes a row and nothing else, and the list gives an operator no way to
 *    tell a token a person made from one a token made. ADR 17's entire promise
 *    — a credential that can be killed without touching a human account — is
 *    silently withdrawn.
 * 2. **The person at the bottom of it would be hidden.** A token belongs to
 *    the person who issued it (ADR 26). Let a token mint a token and "who
 *    authorised this credential" becomes a chain of machines with a person
 *    somewhere at the end of it, which nobody reading the list can see.
 * 3. **The codebase already decided this.** `POST /auth/logout` refuses a
 *    machine caller outright, "precisely so that a compromised machine cannot
 *    revoke itself into looking innocent". Minting and revoking credentials is
 *    the same act with a larger blast radius. This extends a precedent rather
 *    than inventing a rule.
 * 4. **ADR 5 is not touched.** This is not a permission on a person; every
 *    human still does everything. It is the same shape of statement ADR 17
 *    already makes: a rule about what a PROGRAM is, not about who is trusted.
 *
 * Listing is refused for a reason of its own, and it is the one that would have
 * been missed. A `GET` sails through the scope hook untouched, so without this
 * check a read-only MCP token could enumerate every credential in the house:
 * every name, every scope, and when each was last used. That is reconnaissance,
 * and nothing issued to answer "which box is the drill in" has any use for it.
 */
export const machineTokenRoutes: FastifyPluginAsync<MachineTokenRouteOptions> =
  async (app, options) => {
    app.get("/auth/machine-tokens", async (request, reply) => {
      const person = refuseMachineCaller(request);

      const listed = await options.listMachineTokens.execute(managerOf(person));

      // `machineTokenView` is what guarantees the hash never leaves the
      // server, rather than somebody remembering to leave it out here. Whose a
      // token is goes only to somebody who sees other people's (ADR 26).
      return reply.code(200).send({
        machineTokens: listed.map(({ machineToken, issuedBy }) => ({
          ...machineTokenView(machineToken),
          ...(issuedBy === null ? {} : { issuedBy }),
        })),
      });
    });

    /**
     * 201, and the body carries the secret. It is the only time it exists
     * anywhere but in the caller's hands: the server kept a SHA-256 of it and
     * cannot produce it again, which is the property rather than a limitation.
     */
    app.post("/auth/machine-tokens", async (request, reply) => {
      const person = refuseMachineCaller(request);

      const body = createMachineTokenBodySchema.parse(request.body);

      const { token, machineToken } = await options.createMachineToken.execute({
        name: body.name,
        scope: body.scope as MachineTokenScope,
        userId: person.id,
        ...(body.expiresInDays === undefined
          ? {}
          : { expiresInDays: body.expiresInDays }),
      });

      return reply
        .code(201)
        .send({ token, machineToken: machineTokenView(machineToken) });
    });

    /**
     * A `POST` to a verb under the resource, like `/storage-units/:id/move`,
     * because rotation is a named act with a consequence — the old secret dies
     * — and not a patch of a field. `PATCH` would suggest the token is being
     * edited, and the one thing a client could then imagine editing is the
     * scope, which this refuses on purpose.
     *
     * 200 rather than 201: nothing was created. The credential that was there
     * is still there, under the same name, id, scope and owner, holding a new
     * secret.
     */
    app.post("/auth/machine-tokens/:name/rotate", async (request, reply) => {
      const person = refuseMachineCaller(request);

      const { name } = machineTokenNameParamsSchema.parse(request.params);
      // Strict: a body naming a scope or an owner is refused with 400 rather
      // than ignored, because a rotation changes neither (ADR 18, ADR 26).
      const body = rotateMachineTokenBodySchema.parse(request.body ?? {});

      // Somebody else's token is answered as a name nobody holds (ADR 26).
      const rotated = await options.rotateMachineToken.execute({
        name,
        by: managerOf(person),
        ...(body.expiresInDays === undefined
          ? {}
          : { expiresInDays: body.expiresInDays }),
      });

      if (rotated === null) {
        throw noSuchMachineToken(name);
      }

      return reply
        .code(200)
        .send({ token: rotated.token, machineToken: machineTokenView(rotated.machineToken) });
    });

    /**
     * One name, one token, and there is deliberately no route at
     * `DELETE /auth/machine-tokens`. The one time somebody reaches for "revoke
     * everything" is in a panic, and the blast radius is every machine in the
     * house at once — the same refusal the CLI parser already makes.
     *
     * A name that is not there is a 404 rather than a silent 204, for the
     * reason `RevokeMachineToken` gives: this is a person acting on a decision,
     * and "done" in answer to a typo lets them walk away from a credential that
     * is still live.
     */
    app.delete("/auth/machine-tokens/:name", async (request, reply) => {
      const person = refuseMachineCaller(request);

      const { name } = machineTokenNameParamsSchema.parse(request.params);

      // Somebody else's token is answered as a name nobody holds (ADR 26).
      if (!(await options.revokeMachineToken.execute(name, managerOf(person)))) {
        throw noSuchMachineToken(name);
      }

      return reply.code(204).send();
    });
  };

const managerOf = (person: User): MachineTokenManager => ({
  kind: "person",
  userId: person.id,
  role: person.role,
});

const noSuchMachineToken = (name: string): HttpError =>
  new HttpError(
    404,
    "MACHINE_TOKEN_NOT_FOUND",
    `There is no machine token named "${name}"`,
    { machineTokenName: name },
  );

/**
 * 403 rather than 404: the route exists, this caller is authenticated, and it
 * is being refused — which is what 403 is for (RFC 9110), and the same code
 * `POST /auth/logout` answers a machine with. 401 would say "authenticate",
 * which this caller already did, successfully.
 */
const refuseMachineCaller = (request: FastifyRequest): User => {
  if (request.caller.kind !== "machine") {
    // The person behind the session: whoever issues or rotates a token is who
    // it belongs to (ADR 26).
    return request.caller.user;
  }

  throw new HttpError(
    403,
    "MACHINE_TOKEN_CANNOT_MANAGE_MACHINE_TOKENS",
    "A machine token is issued and revoked by a person, never by another machine token",
    { machineTokenName: request.caller.machineToken.name },
  );
};
