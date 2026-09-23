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
} from "@waymark/domain";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyServerOptions,
} from "fastify";
import { ZodError } from "zod";

import { AuthenticateMachineToken } from "../auth/authenticate-machine-token.js";
import { AuthenticateSession } from "../auth/authenticate-session.js";
import {
  AuthError,
  InvalidCredentials,
  InvalidMachineToken,
  InvalidMachineTokenName,
  InvalidSession,
  MachineTokenNameAlreadyTaken,
  ReadOnlyMachineToken,
  TooManyLoginAttempts,
} from "../auth/auth-errors.js";
import { callerMayWrite, type Caller } from "../auth/caller.js";
import type { MachineTokenRepository } from "../auth/machine-token-repository.js";
import type { RateLimiter } from "../auth/login-rate-limiter.js";
import { Login } from "../auth/login.js";
import { Logout } from "../auth/logout.js";
import { CreateMachineToken } from "../auth/create-machine-token.js";
import { RevokeMachineToken } from "../auth/revoke-machine-token.js";
import { RotateMachineToken } from "../auth/rotate-machine-token.js";
import type { PasswordHasher } from "../auth/password-hasher.js";
import type { SessionRepository } from "../auth/session-repository.js";
import type { UserRepository } from "../auth/user-repository.js";
import { PhotoFileStore } from "../photos/photo-file-store.js";
import type { PhotoProcessingDependencies } from "../photos/photo-processing.js";
import { PhotoRelease } from "../photos/photo-release.js";
import { collectApiNamespace, pathnameOf, rootSegmentOf } from "./api-namespace.js";
import { bearerTokenOf } from "./bearer-token.js";
import {
  claimsMachineScheme,
  isWriteRequest,
  machineTokenOf,
} from "./machine-token-header.js";
import { resolveClientIp, type TrustedProxyPolicy } from "./client-ip.js";
import { createWebClient, type WebClient, type WebClientConfig } from "./web-client.js";
import { mapDomainError } from "./error-mapping.js";
import { ItemViews } from "./item-views.js";
import { StorageUnitViews } from "./storage-unit-views.js";
import { errorBody, HttpError } from "./http-error.js";
import { authRoutes, authenticatedAuthRoutes } from "./routes/auth-routes.js";
import { itemRoutes } from "./routes/item-routes.js";
import { machineTokenRoutes } from "./routes/machine-token-routes.js";
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
     * Who is calling: a person with a session, or a machine with a token
     * (ADR 17). Non-null on every route behind the authenticated scope, which
     * is what lets a handler read it without a check of its own.
     */
    caller: Caller;
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
  /** Long-lived credentials that are not people; see ADR 17. */
  readonly machineTokens: MachineTokenRepository;
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
  /** How stale a machine token's `lastUsedAt` may be before it is rewritten. */
  readonly lastUsedGranularityMs?: number;
  readonly logger?: FastifyServerOptions["logger"];
}

/**
 * The JSON bodies this API accepts are a handful of short strings. 64 KiB is
 * already absurdly generous for that.
 *
 * Photo uploads are NOT covered by this: `@fastify/multipart` installs its own
 * content type parser and consumes the request as a stream, so the limit that
 * matters for them is `limits.fileSize`, set from `WAYMARK_MAX_PHOTO_MB`.
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
  /**
   * The same three use cases the admin CLI drives, built once here so the
   * account screen and the shell cannot drift into two behaviours. ADR 18 put
   * routes in front of them; nothing about the use cases themselves changed.
   */
  const createMachineToken = new CreateMachineToken({
    machineTokens: deps.machineTokens,
    ids: deps.ids,
    clock: deps.clock,
  });
  const rotateMachineToken = new RotateMachineToken({
    machineTokens: deps.machineTokens,
    clock: deps.clock,
  });
  const revokeMachineToken = new RevokeMachineToken({
    machineTokens: deps.machineTokens,
  });
  const authenticateMachine = new AuthenticateMachineToken({
    machineTokens: deps.machineTokens,
    clock: deps.clock,
    ...(deps.lastUsedGranularityMs === undefined
      ? {}
      : { lastUsedGranularityMs: deps.lastUsedGranularityMs }),
  });
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
  // The explicit type argument matters: with a union, Fastify's inference
  // picks one arm and then rejects the other as a getter/setter pair.
  app.decorateRequest<Caller>("caller", null as unknown as Caller);

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
      request.caller = await identify(request.headers.authorization);

      /**
       * The scope check, here and not in a route.
       *
       * It runs in the hook that authenticated the caller, which means a
       * read-only machine token is refused a write BEFORE the body is parsed,
       * before a schema sees it and before any use case runs — so a refusal
       * cannot have changed anything, and a caller that may not write learns
       * nothing about the shape of the route it was refused.
       *
       * A person is never refused here: ADR 5 is unchanged, and every
       * authenticated human may perform every inventory operation.
       */
      if (isWriteRequest(request.method) && !callerMayWrite(request.caller)) {
        throw new ReadOnlyMachineToken(
          request.caller.kind === "machine"
            ? request.caller.machineToken.name
            : "",
          request.method,
        );
      }
    });

    /**
     * Which credential was presented is decided by the SCHEME, once, and the
     * request then goes to exactly one authenticator.
     *
     * Never both in turn. Trying the session table and then the machine token
     * table would mean a leak of either was replayable as the other, which is
     * the property `machine-token-header.ts` exists to guarantee.
     */
    async function identify(header: string | string[] | undefined): Promise<Caller> {
      if (claimsMachineScheme(header)) {
        const presented = machineTokenOf(header);
        if (presented === null) {
          throw new InvalidMachineToken();
        }

        return {
          kind: "machine",
          machineToken: await authenticateMachine.execute(presented),
        };
      }

      const token = bearerTokenOf(header);
      if (token === null) {
        throw new InvalidSession();
      }

      const { user, session } = await authenticate.execute(token);

      return { kind: "user", user, session };
    }

    void scope.register(authenticatedAuthRoutes, { login, logout });
    void scope.register(machineTokenRoutes, {
      machineTokens: deps.machineTokens,
      createMachineToken,
      rotateMachineToken,
      revokeMachineToken,
    });
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
    // The default, for the JSON this process answers: nothing should ever be
    // loaded on behalf of a data response, and `'none'` says exactly that.
    //
    // The one document it serves overrides this per response, in
    // `web-client.ts`, rather than loosening it for everything. A document
    // exists to load its own bundle, and a policy wide enough for that is not
    // one a JSON answer has any use for.
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
    // The deployed PWA is on THIS origin now (ADR 16), so it needs nothing
    // from this setting. It stays for the client that is not: a `vite dev`
    // server on its own port, reaching the API with `fetch`, which CORS
    // already gates. Tightening it to `same-origin` would break that and buy
    // nothing the allowlist does not already decide.
    crossOriginResourcePolicy: { policy: "cross-origin" },
  });

  void app.register(cors, {
    /**
     * An allowlist, never a reflection — and, since ADR 16, one that the
     * browser client no longer appears in.
     *
     * The PWA is served from this origin, so nothing it does is a
     * cross-origin request and a browser never applies CORS to any of it.
     * What is left for this list is a browser client served from somewhere
     * ELSE: in practice a `vite dev` on `:5173` pointed at an API on `:3000`.
     * A normal deployment runs with the list empty, which is tighter than it
     * was when the PWA's own origin had to be in it.
     *
     * Deciding `false` is not a refusal. `@fastify/cors` answers the request
     * either way and only decides whether the header is SENT — which matters
     * here, because a browser sends `Origin` on every same-origin WRITE too,
     * and every one of those arrives carrying an origin this empty list does
     * not contain. Turning that into a 403 would break every button in the
     * app, and never in a test that injects straight into Fastify.
     *
     * A request with no `Origin` header at all is not a browser cross-origin
     * request either: that is the Expo app, `curl`, and a health probe.
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

  /**
   * 409: fix the WORLD, then retry (ADR 8). The request bytes are perfectly
   * good and the same call succeeds the moment that name is free, which is
   * something the caller changes by revoking the other token or choosing
   * another word — not by editing this request.
   *
   * Both of these used to be unreachable over HTTP, because only the admin CLI
   * could raise them. ADR 18 put a route in front of `CreateMachineToken`, so
   * they are now refusals a browser has to be able to read.
   */
  if (error instanceof MachineTokenNameAlreadyTaken) {
    return reply
      .code(409)
      .send(
        errorBody("MACHINE_TOKEN_NAME_ALREADY_TAKEN", error.message, {
          machineTokenName: error.tokenName,
        }),
      );
  }

  /**
   * 422: fix the REQUEST, then retry (ADR 8). The name is the argument that
   * revokes this credential later, so one needing shell quoting to type is a
   * thing that goes wrong in a hurry — and the field that has to change is in
   * the body the caller just sent.
   */
  if (error instanceof InvalidMachineTokenName) {
    return reply
      .code(422)
      .send(
        errorBody("INVALID_MACHINE_TOKEN_NAME", error.message, {
          machineTokenName: error.tokenName,
        }),
      );
  }

  if (error instanceof InvalidMachineToken) {
    // 401 and the same challenge a session gets. The header exists to tell a
    // BROWSER how to authenticate and it has one answer; a machine token is
    // configured out of band by an admin and nothing discovers it here.
    return reply
      .code(401)
      .header("www-authenticate", "Bearer")
      .send(errorBody("INVALID_MACHINE_TOKEN", error.message));
  }

  /**
   * 403, and deliberately neither of ADR 8's two codes.
   *
   * 409 means "fix the world, then retry" and 422 means "fix the request, then
   * retry". This is neither: the request bytes are fine and the world is fine,
   * and the identical call succeeds the moment a read-write token makes it.
   * What has to change is the CREDENTIAL, which is what 403 says — the server
   * understood, knows exactly who is asking, and refuses to authorize it
   * (RFC 9110). 401 would be wrong too: it means "authenticate", and this
   * caller already did, successfully.
   */
  if (error instanceof ReadOnlyMachineToken) {
    return reply
      .code(403)
      .send(
        errorBody("READ_ONLY_MACHINE_TOKEN", error.message, {
          machineTokenName: error.tokenName,
          method: error.method,
          requiredScope: "read-write",
        }),
      );
  }

  return reply
    .code(403)
    .send(errorBody("FORBIDDEN", error.message));
};
