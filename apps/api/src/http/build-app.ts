import {
  AttachItemPhoto,
  CreateItem,
  CreateStorageUnit,
  DeleteItem,
  DeleteStorageUnit,
  DetachItemPhoto,
  DomainError,
  EmptyStorageUnit,
  GetStorageUnitPath,
  ListItems,
  MoveItems,
  MoveStorageUnit,
  ReorderItemPhotos,
  SearchInventory,
  SetStorageUnitPhoto,
  UpdateItem,
  UpdateStorageUnit,
  type Clock,
  type IdGenerator,
  type ItemRepository,
  type PhotoRepository,
  type PublicIdGenerator,
  type SearchRepository,
  type StorageUnitRepository,
} from "@ariadna/domain";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
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
import { PhotoFileStore } from "../photos/photo-file-store.js";
import type { PhotoProcessingDependencies } from "../photos/photo-processing.js";
import { PhotoRelease } from "../photos/photo-release.js";
import { collectApiNamespace, pathnameOf, rootSegmentOf } from "./api-namespace.js";
import { bearerTokenOf } from "./bearer-token.js";
import { resolveClientIp, type TrustedProxyPolicy } from "./client-ip.js";
import { createWebClient, type WebClient, type WebClientConfig } from "./web-client.js";
import { mapDomainError } from "./error-mapping.js";
import { ItemViews } from "./item-views.js";
import { StorageUnitViews } from "./storage-unit-views.js";
import { errorBody, HttpError } from "./http-error.js";
import { authRoutes, authenticatedAuthRoutes } from "./routes/auth-routes.js";
import { itemRoutes } from "./routes/item-routes.js";
import { photoRoutes } from "./routes/photo-routes.js";
import { qrRoutes } from "./routes/qr-routes.js";
import { searchRoutes } from "./routes/search-routes.js";
import { storageUnitRoutes } from "./routes/storage-unit-routes.js";
import { toValidationIssues } from "./validation.js";

declare module "fastify" {
  interface FastifyInstance {
    /**
     * The first path segments this API answers for, derived from its own
     * route table. Everything else on this origin belongs to the web client;
     * see `api-namespace.ts`.
     */
    apiNamespace: ReadonlySet<string>;
  }

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

export interface PhotoStorageConfig {
  /** Where photo files live. A Docker volume in production. */
  readonly root: string;
  readonly maxUploadBytes: number;
}

export interface AppDependencies {
  readonly storageUnits: StorageUnitRepository;
  readonly items: ItemRepository;
  readonly photos: PhotoRepository;
  /** Finds the candidates a query could answer; see `SearchRepository`. */
  readonly search: SearchRepository;
  readonly users: UserRepository;
  readonly sessions: SessionRepository;
  readonly hasher: PasswordHasher;
  readonly ids: IdGenerator;
  readonly publicIds: PublicIdGenerator;
  readonly clock: Clock;
  readonly rateLimiter: RateLimiter;
  /** What a scanned QR resolves against; see `qr/storage-unit-qr.ts`. */
  readonly publicBaseUrl: string;
  readonly photoStorage: PhotoStorageConfig;
  /**
   * Background removal, which is optional in every direction: the routes it
   * feeds answer "switched off" rather than disappearing, and nothing on the
   * request path ever waits on it (ADR 4).
   */
  readonly photoProcessing: PhotoProcessingDependencies;
  readonly security: SecurityConfig;
  /**
   * The built web client this process also serves, or absent for an API on
   * its own — which is a complete configuration, and the one `vite dev` runs
   * against. See `web-client.ts`.
   */
  readonly webClient?: WebClientConfig;
  readonly sessionTtlMs?: number;
  readonly renewAfterMs?: number;
  readonly logger?: FastifyServerOptions["logger"];
}

/**
 * The JSON bodies this API accepts are a handful of short strings. 64 KiB is
 * already absurdly generous for that.
 *
 * Photo uploads are NOT covered by this: `@fastify/multipart` installs its own
 * content type parser and consumes the request as a stream, so the limit that
 * matters for them is `limits.fileSize`, set from `ARIADNA_MAX_PHOTO_MB`.
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

  /**
   * Before a single route is registered, because `onRoute` fires as routes
   * are added and never retroactively.
   */
  app.decorate("apiNamespace", collectApiNamespace(app));

  // Read off disk here rather than on the first request: a container whose
  // image was built without the client is broken, and it should say so at
  // boot instead of answering 404 to somebody standing in a garage.
  const webClient =
    deps.webClient === undefined ? null : createWebClient(deps.webClient);

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
    updateStorageUnit: new UpdateStorageUnit({
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
    listItems: new ListItems({
      items: deps.items,
      storageUnits: deps.storageUnits,
    }),
    moveItems: new MoveItems({
      items: deps.items,
      storageUnits: deps.storageUnits,
      clock: deps.clock,
    }),
    updateItem: new UpdateItem({ items: deps.items, clock: deps.clock }),
    deleteItem: new DeleteItem({ items: deps.items }),
    attachItemPhoto: new AttachItemPhoto({
      items: deps.items,
      photos: deps.photos,
      clock: deps.clock,
    }),
    detachItemPhoto: new DetachItemPhoto({ items: deps.items, clock: deps.clock }),
    reorderItemPhotos: new ReorderItemPhotos({
      items: deps.items,
      clock: deps.clock,
    }),
    setStorageUnitPhoto: new SetStorageUnitPhoto({
      storageUnits: deps.storageUnits,
      photos: deps.photos,
      clock: deps.clock,
    }),
    searchInventory: new SearchInventory({
      search: deps.search,
      storageUnits: deps.storageUnits,
    }),
  };

  // One projector, shared by every route that answers with an item, so the
  // photo rows behind `ItemView.photos` are loaded the same way everywhere.
  const itemViews = new ItemViews(deps.photos);
  // And one for the unit a client asked ABOUT, which is the only projection of
  // a unit that carries its photo. Rows stay rows.
  const storageUnitViews = new StorageUnitViews(deps.photos);

  const photoFiles = new PhotoFileStore(deps.photoStorage.root);
  const photoRelease = new PhotoRelease({ photos: deps.photos, files: photoFiles });

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

  void app.register(multipart, {
    limits: {
      // One file, no other fields, and nothing bigger than the configured cap.
      // Everything a photo upload needs, and nothing an attacker can use to
      // make the parser do work that was never asked for.
      fileSize: deps.photoStorage.maxUploadBytes,
      files: 1,
      fields: 0,
      parts: 2,
    },
    throwFileSizeLimit: true,
  });

  registerSecurityPlugins(app, deps.security);
  registerErrorHandling(app, webClient);

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
      itemViews,
      storageUnitViews,
      ...useCases,
    });
    void scope.register(itemRoutes, {
      items: deps.items,
      itemViews,
      photoRelease,
      ...useCases,
    });
    void scope.register(photoRoutes, {
      items: deps.items,
      storageUnits: deps.storageUnits,
      photos: deps.photos,
      files: photoFiles,
      release: photoRelease,
      ids: deps.ids,
      maxUploadBytes: deps.photoStorage.maxUploadBytes,
      processing: deps.photoProcessing,
      itemViews,
      storageUnitViews,
      ...useCases,
    });
    void scope.register(searchRoutes, {
      searchInventory: useCases.searchInventory,
      itemViews,
    });
    void scope.register(qrRoutes, {
      storageUnits: deps.storageUnits,
      publicBaseUrl: deps.publicBaseUrl,
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
    // `PATCH` is here because editing a unit or an item is a patch of the
    // resource (see `storage-unit-routes.ts`). It is not a simple method, so
    // a browser preflights it, and a list that forgot it would fail in the
    // PWA only — never in a test that injects straight into Fastify.
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
    exposedHeaders: ["Location", "Retry-After"],
    // The session is an `Authorization` header, not a cookie. Without cookies
    // there is nothing for a cross-site request to attach by itself, so CSRF
    // has no surface here at all.
    credentials: false,
    maxAge: 600,
  });
};

const registerErrorHandling = (
  app: FastifyInstance,
  webClient: WebClient | null,
): void => {
  /**
   * # Where the two namespaces on this origin are told apart
   *
   * This runs only when Fastify matched no route, so every API route answers
   * exactly as it did before the web client existed — there is no wildcard in
   * front of them and no ordering to get right.
   *
   * What is left is a path nothing serves, and it is handed to the client
   * only when all four of these hold:
   *
   * 1. There IS a built client. With none, this is the JSON service it always
   *    was, which is what every other test file in this suite runs against.
   * 2. The first segment is not one the API claims. An API path that no
   *    longer exists must answer `404 application/json`, because a client
   *    handed `200 text/html` instead reports `unexpected token < in JSON` —
   *    a sentence about a parser that sends somebody to the wrong layer.
   * 3. It is a read. A `POST` answered with a page would tell a client its
   *    write had been accepted.
   * 4. `web-client.ts` recognises it: a file that exists, or a path with no
   *    file extension, which is what a client-side route looks like. A
   *    missing `.js` is a 404 rather than a shell, for reason 2 again one
   *    layer down.
   *
   * The deliberate consequence is that a path belonging to nobody — a typo —
   * draws the app, which then says it has no such screen. That is the right
   * half to be generous in: the person typing it is a person, and the client
   * has its own not-found screen to show them.
   */
  app.setNotFoundHandler(async (request, reply) => {
    const isRead = request.method === "GET" || request.method === "HEAD";
    const pathname = pathnameOf(request.url);
    const segment = rootSegmentOf(pathname);

    if (
      webClient !== null &&
      isRead &&
      (segment === null || !app.apiNamespace.has(segment)) &&
      webClient.send(request, reply, pathname)
    ) {
      return reply;
    }

    return reply
      .code(404)
      .send(
        errorBody("NOT_FOUND", `No route for ${request.method} ${request.url}`),
      );
  });

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
