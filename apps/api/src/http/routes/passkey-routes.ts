import type { FastifyPluginAsync, FastifyRequest } from "fastify";

import type { BeginPasskeyAuthentication } from "../../auth/begin-passkey-authentication.js";
import type { BeginPasskeyRegistration } from "../../auth/begin-passkey-registration.js";
import type { FinishPasskeyAuthentication } from "../../auth/finish-passkey-authentication.js";
import type { FinishPasskeyRegistration } from "../../auth/finish-passkey-registration.js";
import { PasskeyNeedsAPassword, PasskeyNotFound } from "../../auth/auth-errors.js";
import type { PasskeyRepository } from "../../auth/passkey-repository.js";
import { SessionOpener } from "../../auth/session.js";
import type { User } from "../../auth/user.js";
import { HttpError } from "../http-error.js";
import {
  finishPasskeyLoginBodySchema,
  finishPasskeyRegistrationBodySchema,
  passkeyIdParamsSchema,
} from "../validation.js";
import { passkeyView, type UserView } from "../views.js";

export interface PasskeyLoginRouteOptions {
  readonly beginPasskeyAuthentication: BeginPasskeyAuthentication;
  readonly finishPasskeyAuthentication: FinishPasskeyAuthentication;
}

/**
 * # The two routes that are not behind a session, and cannot be
 *
 * Signing in is the one thing that happens before there is anything to sign
 * in with, so these sit beside `POST /auth/login` in the unauthenticated
 * scope. Everything ADR 19 says about what they may reveal applies here: the
 * options answer is the same for everybody — a random challenge, no credential
 * ids — so neither route can be asked about a person, because neither takes
 * one.
 *
 * `passkey-login`, and not `passkeys`, because these are not operations on a
 * passkey: they are a way to open a session, which is what `/auth/login`
 * already is in this API's vocabulary.
 */
export const passkeyLoginRoutes: FastifyPluginAsync<PasskeyLoginRouteOptions> =
  async (app, options) => {
    /**
     * A `POST` for a read-shaped thing, because it WRITES: a ceremony is a row
     * with a two-minute life, and a `GET` that creates one would be cached by
     * something eventually and hand two people the same challenge.
     */
    app.post("/auth/passkey-login/options", async (request, reply) => {
      const started = await options.beginPasskeyAuthentication.execute(
        request.clientIp,
      );

      return reply.code(200).send(started);
    });

    /**
     * The same 200 and the same body `POST /auth/login` answers. ADR 6 is
     * about a mechanism, and this is another way to reach it — so a client
     * reads one shape and never learns a second kind of session.
     */
    app.post("/auth/passkey-login", async (request, reply) => {
      const body = finishPasskeyLoginBodySchema.parse(request.body);

      const result = await options.finishPasskeyAuthentication.execute({
        ceremonyId: body.ceremonyId,
        credential: body.credential as never,
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

export interface PasskeyRouteOptions {
  readonly passkeys: PasskeyRepository;
  readonly beginPasskeyRegistration: BeginPasskeyRegistration;
  readonly finishPasskeyRegistration: FinishPasskeyRegistration;
}

/**
 * # Managing the devices on your own account
 *
 * Four routes behind a session, and two different rules about which sessions.
 *
 * ## Adding one needs the password; removing one does not
 *
 * ADR 19 takes ADR 18's sentence about machine tokens and changes one word: a
 * credential that can issue its own successor outlives every password change
 * made to stop it. So `POST /auth/passkeys/options` and `POST /auth/passkeys`
 * refuse a session that a passkey opened, and somebody adding their laptop
 * after signing in on their phone types their password once.
 *
 * Listing and removing take any session at all, and the asymmetry is
 * deliberate rather than an oversight. Minting must be hard and revoking must
 * be easy: the person who has just realised a device is gone is holding their
 * phone, not sitting at a keyboard with their password to hand, and a rule
 * that made them go and find it is a rule that ends in them not revoking
 * anything. Nothing is at risk in that direction — removing a credential
 * cannot lock anybody out, because the password form never leaves the sign-in
 * screen.
 *
 * ## A machine token is refused all four
 *
 * Three of them are writes, so a read-scoped token never arrives: the scope
 * hook in `build-app.ts` refuses it before the body is parsed. A read-write
 * one passes that hook, and the LIST passes it too — a `GET` is not a write —
 * so both are refused here, for a reason of their own.
 *
 * A passkey is a person's thumb. A machine token has no person behind it
 * (`machine-token.ts` argues at length that it deliberately carries no
 * `userId`), so "the caller's passkeys" is a phrase with no referent: there is
 * no account whose devices these would be. And enumerating somebody's
 * authenticators — which laptop they own, whether they carry a security key —
 * is the same reconnaissance ADR 18 refuses a machine for the token list, on a
 * subject that is more personal rather than less.
 */
export const passkeyRoutes: FastifyPluginAsync<PasskeyRouteOptions> = async (
  app,
  options,
) => {
  app.get("/auth/passkeys", async (request, reply) => {
    const user = personBehind(request);

    const passkeys = await options.passkeys.listForUser(user.id);

    // `passkeyView` is what guarantees the key, the credential id and the
    // counter never leave the server, rather than somebody remembering to
    // leave them out here.
    return reply.code(200).send({ passkeys: passkeys.map(passkeyView) });
  });

  app.post("/auth/passkeys/options", async (request, reply) => {
    const user = personBehindAPassword(request);

    const started = await options.beginPasskeyRegistration.execute(user);

    return reply.code(200).send(started);
  });

  /**
   * 201, and the body is the device as its owner will read it in the list.
   *
   * There is no secret to hand back and never will be: the private half of a
   * passkey never leaves the authenticator, which is the entire difference
   * between this and the machine token beside it in the same sheet.
   */
  app.post("/auth/passkeys", async (request, reply) => {
    const user = personBehindAPassword(request);

    const body = finishPasskeyRegistrationBodySchema.parse(request.body);

    const passkey = await options.finishPasskeyRegistration.execute({
      user,
      ceremonyId: body.ceremonyId,
      label: body.label,
      credential: body.credential as never,
    });

    return reply.code(201).send({ passkey: passkeyView(passkey) });
  });

  /**
   * One device, by its id, and there is deliberately no route that removes
   * them all — the same refusal the machine tokens make, for the same reason:
   * the one time somebody reaches for "revoke everything" is in a panic.
   *
   * A 404 rather than a silent 204 for an id that is not theirs, because this
   * is a person acting on a decision and "done" in answer to nothing lets them
   * walk away believing a device they no longer trust has gone. It is also the
   * same answer somebody else's id gets, which is what stops this confirming
   * another person's credential to whoever guessed at one.
   */
  app.delete("/auth/passkeys/:id", async (request, reply) => {
    const user = personBehind(request);

    const { id } = passkeyIdParamsSchema.parse(request.params);

    if (!(await options.passkeys.deleteFor(user.id, id))) {
      throw new PasskeyNotFound(id);
    }

    return reply.code(204).send();
  });
};

const personBehind = (request: FastifyRequest): User => {
  if (request.caller.kind === "machine") {
    throw new HttpError(
      403,
      "MACHINE_TOKEN_HAS_NO_PASSKEYS",
      "A passkey belongs to a person, and a machine token has no person behind it",
      { machineTokenName: request.caller.machineToken.name },
    );
  }

  return request.caller.user;
};

/**
 * The same caller, plus the one extra thing adding a credential needs: that
 * this session was opened by somebody typing a password (ADR 19).
 */
const personBehindAPassword = (request: FastifyRequest): User => {
  const user = personBehind(request);

  if (
    request.caller.kind === "user" &&
    request.caller.session.createdWith !== SessionOpener.Password
  ) {
    throw new PasskeyNeedsAPassword();
  }

  return user;
};
