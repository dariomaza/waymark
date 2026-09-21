import { FetchInterceptor } from "@mswjs/interceptors/fetch";

/**
 * # The network is stubbed at the HTTP boundary and nowhere else
 *
 * Nothing in `src` is ever mocked. The tests run the real screens, the real
 * query cache and the real `@ariadna/api-client` — the same module the web app
 * runs — and this answers the requests the way `apps/api` would. A test that
 * replaced the app's own client would prove the replacement was called and say
 * nothing about the contract with the API.
 *
 * ## Why this is not MSW
 *
 * `apps/web` uses MSW, and so should this. MSW's current releases reach a
 * dependency that ships only as `.mjs`, and Jest — which is what an Expo app
 * is tested with — refuses to `require` an ES module however it is configured;
 * `transformIgnorePatterns` does not help, because the refusal is about the
 * extension rather than about the syntax.
 *
 * So the interception is MSW's own engine, `@mswjs/interceptors`, driven
 * directly. It is the real `fetch`, really replaced, answering real `Response`
 * objects: the boundary is exactly the one MSW puts it at, with the routing
 * DSL written out here instead of imported. The shape is deliberately the
 * shape of the MSW one so the two suites read alike.
 *
 * The day MSW ships a build Jest can require, this file becomes two lines.
 */

export const API_URL = "http://127.0.0.1:3000";

export interface RequestContext {
  readonly request: Request;
}

export type Resolver = (
  context: RequestContext,
) => Response | Promise<Response>;

interface Route {
  readonly method: string;
  /** Matched without the query string, exactly as MSW matches a path. */
  readonly url: string;
  readonly resolve: Resolver;
}

const route =
  (method: string) =>
  (url: string, resolve: Resolver): Route => ({ method, url, resolve });

/** The verbs this API answers to. `delete` is spelled out; it is a keyword. */
export const http = {
  get: route("GET"),
  post: route("POST"),
  patch: route("PATCH"),
  delete: route("DELETE"),
};

const JSON_TYPE = { "content-type": "application/json" } as const;

/** A network failure, as opposed to a refusal the API expressed. */
const NETWORK_ERROR = Symbol("network-error");

export const HttpResponse = {
  json(body: unknown, init: ResponseInit = {}): Response {
    return new Response(JSON.stringify(body), {
      ...init,
      headers: { ...JSON_TYPE, ...init.headers },
    });
  },
  arrayBuffer(buffer: ArrayBuffer, init: ResponseInit = {}): Response {
    return new Response(buffer, init);
  },
  text(body: string, init: ResponseInit = {}): Response {
    return new Response(body, init);
  },
  /** A completed call with nothing in it, like a 204. */
  empty(init: ResponseInit = {}): Response {
    return new Response(null, init);
  },
  /** The request never got out. `fetch` rejects; nothing answered. */
  error(): Response {
    return { [NETWORK_ERROR]: true } as unknown as Response;
  },
};

const isNetworkError = (response: Response): boolean =>
  (response as unknown as Record<symbol, unknown>)[NETWORK_ERROR] === true;

const pathOf = (url: string): string => {
  const parsed = new URL(url);

  return `${parsed.origin}${parsed.pathname}`;
};

const createApiServer = () => {
  const interceptor = new FetchInterceptor();
  let routes: Route[] = [];
  let unhandled: string[] = [];

  interceptor.on("request", async ({ request, controller }) => {
    const wanted = pathOf(request.url);
    // Last one in wins, so a test can override a handler its setup installed.
    const matched = [...routes]
      .reverse()
      .find((candidate) => candidate.method === request.method && candidate.url === wanted);

    if (matched === undefined) {
      unhandled.push(`${request.method} ${wanted}`);
      controller.errorWith(
        new Error(`No handler for ${request.method} ${wanted}`),
      );

      return;
    }

    const response = await matched.resolve({ request });
    if (isNetworkError(response)) {
      controller.errorWith(new Error("Network error"));

      return;
    }

    controller.respondWith(response);
  });

  return {
    listen(): void {
      interceptor.apply();
    },
    use(...added: readonly Route[]): void {
      routes = [...routes, ...added];
    },
    /**
     * Fails the test that asked for something it never declared a handler for.
     * A request nobody stubbed is a test that does not know what it depends on.
     */
    assertEverythingWasHandled(): void {
      const missed = unhandled;
      unhandled = [];
      if (missed.length > 0) {
        throw new Error(
          `The app made requests no handler answered:\n  ${missed.join("\n  ")}`,
        );
      }
    },
    resetHandlers(): void {
      routes = [];
    },
    close(): void {
      interceptor.dispose();
    },
  };
};

export const apiServer = createApiServer();
