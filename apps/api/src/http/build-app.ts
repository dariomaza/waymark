import {
  CreateItem,
  CreateStorageUnit,
  DeleteItem,
  DeleteStorageUnit,
  DomainError,
  EmptyStorageUnit,
  GetStorageUnitPath,
  MoveItems,
  MoveStorageUnit,
  type Clock,
  type IdGenerator,
  type ItemRepository,
  type PublicIdGenerator,
  type StorageUnitRepository,
} from "@ariadna/domain";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyServerOptions,
} from "fastify";
import { ZodError } from "zod";

import { AuthenticateSession, type AuthenticatedCaller } from "../auth/authenticate-session.js";
import {
  AuthError,
  InvalidCredentials,
  InvalidSession,
  TooManyLoginAttempts,
} from "../auth/auth-errors.js";
import type { RateLimiter } from "../auth/login-rate-limiter.js";
import { Login } from "../auth/login.js";
import { Logout } from "../auth/logout.js";
import type { PasswordHasher } from "../auth/password-hasher.js";
import type { SessionRepository } from "../auth/session-repository.js";
import type { UserRepository } from "../auth/user-repository.js";
import { bearerTokenOf } from "./bearer-token.js";
import { resolveClientIp, type TrustedProxyPolicy } from "./client-ip.js";
import { mapDomainError } from "./error-mapping.js";
import { errorBody, HttpError } from "./http-error.js";
import { authRoutes, authenticatedAuthRoutes } from "./routes/auth-routes.js";
import { itemRoutes } from "./routes/item-routes.js";
import { storageUnitRoutes } from "./routes/storage-unit-routes.js";
import { toValidationIssues } from "./validation.js";

declare module "fastify" {
  interface FastifyRequest {
    /** Resolved once per request; see `resolveClientIp`. */
    clientIp: string;
    /**
     * Who is calling. Non-null on every route behind the authenticated scope,
     * which is what lets a handler read it without a check of its own.
     */
    caller: AuthenticatedCaller;
  }
}

export interface SecurityConfig extends TrustedProxyPolicy {
  /**
   * Browser origins allowed to call the API. Exact strings, no wildcards: this
   * list is short and hand written, and a pattern would eventually match
   * something nobody meant.
   */
  readonly allowedOrigins: readonly string[];
}

export interface AppDependencies {
  readonly storageUnits: StorageUnitRepository;
  readonly items: ItemRepository;
  readonly users: UserRepository;
  readonly sessions: SessionRepository;
  readonly hasher: PasswordHasher;
  readonly ids: IdGenerator;
  readonly publicIds: PublicIdGenerator;
  readonly clock: Clock;
  readonly rateLimiter: RateLimiter;
  readonly security: SecurityConfig;
  readonly sessionTtlMs?: number;
  readonly renewAfterMs?: number;
  readonly logger?: FastifyServerOptions["logger"];
}

/**
 * The JSON bodies this API accepts are a handful of short strings. 64 KiB is
 * already absurdly generous for that, and photo upload — the one thing that
 * would need more — is a separate endpoint in a separate work unit.
 */
const BODY_LIMIT_BYTES = 64 * 1024;

const HSTS_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

export const buildApp = (deps: AppDependencies): FastifyInstance => {
  const app = Fastify({
    logger: deps.logger ?? true,
    bodyLimit: BODY_LIMIT_BYTES,
    // The client address is resolved by `resolveClientIp`, which knows about
    // `CF-Connecting-IP` and about which peers may speak for someone else.
    // Fastify's own `trustProxy` reads `X-Forwarded-For`, which Cloudflare also
    // sets and which anyone can append to; two answers to the same question is
    // one too many.
    trustProxy: false,
  });

  const useCases = {
    createStorageUnit: new CreateStorageUnit({
      storageUnits: deps.storageUnits,
      ids: deps.ids,
      publicIds: deps.publicIds,
      clock: deps.clock,
    }),
    moveStorageUnit: new MoveStorageUnit({
      storageUnits: deps.storageUnits,
      clock: deps.clock,
    }),
    deleteStorageUnit: new DeleteStorageUnit({
      storageUnits: deps.storageUnits,
      items: deps.items,
    }),
    emptyStorageUnit: new EmptyStorageUnit({
      storageUnits: deps.storageUnits,
      items: deps.items,
      clock: deps.clock,
    }),
    getStorageUnitPath: new GetStorageUnitPath({
      storageUnits: deps.storageUnits,
    }),
    createItem: new CreateItem({
      items: deps.items,
      storageUnits: deps.storageUnits,
      ids: deps.ids,
      clock: deps.clock,
    }),
    moveItems: new MoveItems({
      items: deps.items,
      storageUnits: deps.storageUnits,
      clock: deps.clock,
    }),
    deleteItem: new DeleteItem({ items: deps.items }),
  };

  const login = new Login({
    users: deps.users,
    sessions: deps.sessions,
    hasher: deps.hasher,
    ids: deps.ids,
    clock: deps.clock,
    rateLimiter: deps.rateLimiter,
    ...(deps.sessionTtlMs === undefined ? {} : { sessionTtlMs: deps.sessionTtlMs }),
  });
  const logout = new Logout({ sessions: deps.sessions });
  const authenticate = new AuthenticateSession({
    users: deps.users,
    sessions: deps.sessions,
    clock: deps.clock,
    ...(deps.sessionTtlMs === undefined ? {} : { sessionTtlMs: deps.sessionTtlMs }),
    ...(deps.renewAfterMs === undefined ? {} : { renewAfterMs: deps.renewAfterMs }),
  });

  app.decorateRequest("clientIp", "");
  // `null` until the authenticated scope's hook fills it in. Declared as
  // non-nullable because every route that reads it lives behind that hook.
  app.decorateRequest("caller", null as unknown as AuthenticatedCaller);

  app.addHook("onRequest", async (request) => {
    request.clientIp = resolveClientIp(
      { headers: request.headers, remoteAddress: request.socket.remoteAddress },
      deps.security,
    );
  });

  registerSecurityPlugins(app, deps.security);
  registerErrorHandling(app);

  app.get("/health", async (_request, reply) => reply.code(200).send({ status: "ok" }));

  void app.register(authRoutes, { login, logout });

  /**
   * Everything below this line needs a session. An encapsulated scope with one
   * `onRequest` hook is what makes that structural: a route added to this
   * plugin is protected because of where it lives, not because somebody
   * remembered to add a hook to it.
   */
  void app.register(async (scope) => {
    scope.addHook("onRequest", async (request) => {
      const token = bearerTokenOf(request.headers.authorization);
      if (token === null) {
        throw new InvalidSession();
      }

      request.caller = await authenticate.execute(token);
    });

    void scope.register(authenticatedAuthRoutes, { login, logout });
    void scope.register(storageUnitRoutes, {
      storageUnits: deps.storageUnits,
      items: deps.items,
      ...useCases,
    });
    void scope.register(itemRoutes, {
      items: deps.items,
      ...useCases,
    });
  });

  return app;
};

const registerSecurityPlugins = (
  app: FastifyInstance,
  security: SecurityConfig,
): void => {
  void app.register(helmet, {
    // This process answers JSON and serves no document, so nothing should ever
    // be loaded on its behalf. `'none'` says exactly that, and it is also the
    // cheapest possible defence if a response is ever rendered somewhere.
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        "default-src": ["'none'"],
        "frame-ancestors": ["'none'"],
        "base-uri": ["'none'"],
        "form-action": ["'none'"],
      },
    },
    // Cloudflare terminates TLS and the tunnel is outbound, so a browser should
    // never be talking to this hostname over plain HTTP.
    hsts: { maxAge: HSTS_MAX_AGE_SECONDS, includeSubDomains: true },
    frameguard: { action: "deny" },
    referrerPolicy: { policy: "no-referrer" },
    // The PWA lives on its own origin and reaches the API with `fetch`, which
    // CORS already gates. Blocking cross origin reads on top of that would only
    // break the very client this API exists for.
    crossOriginResourcePolicy: { policy: "cross-origin" },
  });

  void app.register(cors, {
    /**
     * An allowlist, never a reflection.
     *
     * A request with no `Origin` header is not a browser cross-origin request
     * at all: that is the Expo app, `curl`, and a health probe. Refusing those
     * would block the Android client for no gain, since CORS is a rule browsers
     * enforce on behalf of a document and there is no document here.
     */
    origin: (origin, callback) => {
      if (origin === undefined) {
        callback(null, true);
        return;
      }

      callback(null, security.allowedOrigins.includes(origin));
    },
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
    exposedHeaders: ["Location", "Retry-After"],
    // The session is an `Authorization` header, not a cookie. Without cookies
    // there is nothing for a cross-site request to attach by itself, so CSRF
    // has no surface here at all.
    credentials: false,
    maxAge: 600,
  });
};

const registerErrorHandling = (app: FastifyInstance): void => {
  app.setNotFoundHandler(async (request, reply) =>
    reply
      .code(404)
      .send(
        errorBody(
          "NOT_FOUND",
          `No route for ${request.method} ${request.url}`,
        ),
      ),
  );

  app.setErrorHandler(async (error, request, reply) => {
    if (error instanceof ZodError) {
      return reply
        .code(400)
        .send(
          errorBody("VALIDATION_FAILED", "The request body or path is malformed", {
            issues: toValidationIssues(error),
          }),
        );
    }

    if (error instanceof AuthError) {
      return sendAuthError(error, reply);
    }

    if (error instanceof HttpError) {
      return reply
        .code(error.status)
        .send(errorBody(error.code, error.message, error.details));
    }

    if (error instanceof DomainError) {
      // `request.params` IS the set of resources the URL addresses, which is
      // what decides 404 against 422 for a "not found".
      const addressedIds = new Set(
        Object.values(request.params ?? {}).filter(
          (value): value is string => typeof value === "string",
        ),
      );

      const mapped = mapDomainError(error, addressedIds);
      if (mapped === null) {
        // Not reachable while the completeness test in `error-mapping.test.ts`
        // passes. Logged as a bug in the table rather than as a bad request.
        request.log.error(
          { err: error, domainError: error.constructor.name },
          "domain error with no entry in the HTTP mapping table",
        );

        return reply
          .code(500)
          .send(
            errorBody(
              "UNMAPPED_DOMAIN_ERROR",
              "The server refused the request for a reason it cannot describe",
            ),
          );
      }

      if (mapped.status >= 500) {
        request.log.error({ err: error }, "stored data is inconsistent");
      }

      return reply
        .code(mapped.status)
        .send(errorBody(mapped.code, error.message, mapped.details));
    }

    // Fastify's own refusals: an unparseable JSON body, an unsupported content
    // type, a payload over the limit. They already carry the right status.
    const refusal = error as {
      readonly statusCode?: number;
      readonly code?: string;
      readonly message?: string;
    };
    const status = refusal.statusCode ?? 500;
    if (status < 500) {
      return reply
        .code(status)
        .send(
          errorBody(
            refusal.code ?? "BAD_REQUEST",
            refusal.message ?? "The request could not be processed",
          ),
        );
    }

    request.log.error({ err: error }, "unhandled error");

    return reply
      .code(500)
      .send(errorBody("INTERNAL_ERROR", "Something went wrong on the server"));
  });
};

const sendAuthError = async (
  error: AuthError,
  reply: FastifyReply,
): Promise<unknown> => {
  if (error instanceof TooManyLoginAttempts) {
    return reply
      .code(429)
      .header("retry-after", String(error.retryAfterSeconds))
      .send(errorBody("TOO_MANY_LOGIN_ATTEMPTS", error.message));
  }

  if (error instanceof InvalidCredentials) {
    return reply
      .code(401)
      .header("www-authenticate", "Bearer")
      .send(errorBody("INVALID_CREDENTIALS", error.message));
  }

  if (error instanceof InvalidSession) {
    return reply
      .code(401)
      .header("www-authenticate", "Bearer")
      .send(errorBody("INVALID_SESSION", error.message));
  }

  return reply
    .code(403)
    .send(errorBody("FORBIDDEN", error.message));
};
