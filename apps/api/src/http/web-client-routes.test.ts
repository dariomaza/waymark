import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { MissingWebClient, createWebClient } from "./web-client.js";
import {
  TEST_PASSWORD,
  TEST_USERNAME,
  createTestApi,
  type TestApi,
} from "./testing/test-api.js";
import {
  HASHED_SCRIPT,
  HASHED_STYLESHEET,
  HASHED_WORKBOX,
  MANIFEST,
  SERVICE_WORKER,
  SHELL_MARKER,
  UNHASHED_ICON,
  UNHASHED_TOUCH_ICON,
  createSecretBesideWebRoot,
  createWebRootFixture,
} from "./testing/web-root.js";

/**
 * # Serving the built web client from the API's own origin
 *
 * One container, one hostname, and the PWA loaded from the same process that
 * answers its requests. The interesting half of that is not that `/` draws a
 * page — it is everything the fallback must REFUSE to answer with a page.
 *
 * A client that asks for an API path and gets `200 text/html` reports
 * "unexpected token < in JSON", which is a sentence about the parser and not
 * about the route that went missing. That is an hour spent in the wrong
 * layer, so it is the first thing pinned here.
 */
describe("the web client served from the API", () => {
  let api: TestApi;
  let webRoot: string;
  let token: string;

  beforeAll(async () => {
    webRoot = await createWebRootFixture();
    api = await createTestApi({ webRoot });
  });

  afterAll(async () => {
    await api.destroy();
    await rm(webRoot, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await api.reset();
    await api.createUser(TEST_USERNAME, TEST_PASSWORD);
    token = await api.login();
  });

  describe("the shell", () => {
    it("is served at the root", async () => {
      const response = await api.app.inject({ method: "GET", url: "/" });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toBe("text/html; charset=utf-8");
      expect(response.body).toContain(SHELL_MARKER);
    });

    it("needs no session, because a login screen cannot be behind a login", async () => {
      const response = await api.app.inject({ method: "GET", url: "/" });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain(SHELL_MARKER);
    });

    it("answers the address printed on a box, which the client resolves itself", async () => {
      // ADR 12: `/u/<publicId>` is a screen in the PWA, not a route in the API.
      const response = await api.app.inject({
        method: "GET",
        url: "/u/ABCDEFGHJK",
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain(SHELL_MARKER);
    });

    it.each([
      ["a client route", "/units/6f1b0d3e-1a9e-4c1a-9a2f-2f1b0d3e1a9e"],
      ["a nested client route", "/units/abc/label"],
      ["a client route the app does not have either", "/nothing/at/all"],
      ["the web client's own list of everything", "/things"],
      ["the web client's own search screen", "/find"],
    ])("is served for %s", async (_what, url) => {
      const response = await api.app.inject({ method: "GET", url });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain(SHELL_MARKER);
    });

    it("answers a HEAD with the headers and no body", async () => {
      const response = await api.app.inject({ method: "HEAD", url: "/" });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toBe("text/html; charset=utf-8");
      expect(response.body).toBe("");
    });
  });

  describe("an API path never falls through to the shell", () => {
    it.each([
      ["a sub-path of a route that exists", "/storage-units/nope/deeper"],
      ["one item, one level too deep", "/items/nope/deeper"],
      ["a photo route that was removed", "/photos/nope/deeper"],
      ["a search sub-path", "/search/everything"],
      ["something under the auth namespace", "/auth/register"],
      ["a health sub-path", "/health/deep"],
    ])("answers JSON for %s", async (_what, url) => {
      const response = await api.app.inject({
        method: "GET",
        url,
        headers: api.authHeaders(token),
      });

      expect(response.statusCode).toBe(404);
      expect(response.headers["content-type"]).toContain("application/json");
      expect(response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
      expect(response.body).not.toContain(SHELL_MARKER);
    });

    it("answers JSON for an API path presented with no session at all", async () => {
      // The interesting direction: the fallback must not be reachable by
      // dropping the `Authorization` header.
      const response = await api.app.inject({
        method: "GET",
        url: "/items/nope/deeper",
      });

      expect(response.statusCode).toBe(404);
      expect(response.headers["content-type"]).toContain("application/json");
    });

    it("answers JSON for a write to a path nothing serves", async () => {
      // A shell in answer to a POST would tell a client its write had been
      // accepted as a page.
      const response = await api.app.inject({
        method: "POST",
        url: "/nothing/at/all",
        payload: {},
        headers: api.authHeaders(token),
      });

      expect(response.statusCode).toBe(404);
      expect(response.headers["content-type"]).toContain("application/json");
    });

    it("answers JSON for a method an existing route does not take", async () => {
      const response = await api.app.inject({
        method: "DELETE",
        url: "/health",
      });

      expect(response.statusCode).toBe(404);
      expect(response.headers["content-type"]).toContain("application/json");
    });

    it("answers JSON for an asset that is not there, rather than the shell", async () => {
      // The other half of the same bug: a stale shell asking for a chunk that
      // a deploy replaced must get a 404, never a page that begins with `<`.
      const response = await api.app.inject({
        method: "GET",
        url: "/assets/index-GONEGONE.js",
      });

      expect(response.statusCode).toBe(404);
      expect(response.headers["content-type"]).toContain("application/json");
    });

    it("owns exactly the namespace the routes claim", async () => {
      // Derived from Fastify's own route table rather than written down, so a
      // new family of API routes is covered the moment it is registered. The
      // literal is here so that REMOVING one is a visible change: the day
      // `/search` stops being a route, this fails instead of letting the
      // shell quietly answer for it.
      expect([...api.app.apiNamespace].sort()).toEqual([
        "auth",
        "health",
        "items",
        "photos",
        "search",
        "storage-units",
      ]);
    });
  });

  describe("the API still answers as it did", () => {
    it("serves the forest to a caller with a session", async () => {
      const response = await api.app.inject({
        method: "GET",
        url: "/storage-units",
        headers: api.authHeaders(token),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ tree: [] });
    });

    it("still refuses an API route with no session, rather than drawing a page", async () => {
      const response = await api.app.inject({
        method: "GET",
        url: "/storage-units",
      });

      expect(response.statusCode).toBe(401);
      expect(response.headers["content-type"]).toContain("application/json");
      expect(response.body).not.toContain(SHELL_MARKER);
    });

    it("still answers the health probe", async () => {
      const response = await api.app.inject({ method: "GET", url: "/health" });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: "ok" });
    });
  });

  describe("caching, which is opposite for the shell and for a hashed asset", () => {
    it.each([
      ["the module", HASHED_SCRIPT, "text/javascript; charset=utf-8"],
      ["the stylesheet", HASHED_STYLESHEET, "text/css; charset=utf-8"],
      ["the workbox runtime at the root", HASHED_WORKBOX, "text/javascript; charset=utf-8"],
    ])(
      "lets a browser keep %s for a year, because its name IS its contents",
      async (_what, path, contentType) => {
        const response = await api.app.inject({ method: "GET", url: `/${path}` });

        expect(response.statusCode).toBe(200);
        expect(response.headers["content-type"]).toBe(contentType);
        expect(response.headers["cache-control"]).toBe(
          "public, max-age=31536000, immutable",
        );
      },
    );

    it("makes the shell revalidate every time, because its URL never changes", async () => {
      const response = await api.app.inject({ method: "GET", url: "/" });

      expect(response.headers["cache-control"]).toBe("public, no-cache");
      expect(response.headers["etag"]).toMatch(/^"[0-9a-f]{32}"$/u);
    });

    it.each([
      ["the service worker", SERVICE_WORKER],
      ["the manifest", MANIFEST],
      ["an icon whose name merely has a dash in it", UNHASHED_ICON],
      ["an icon with two dashes in it", UNHASHED_TOUCH_ICON],
    ])("makes %s revalidate, because its name is not a hash", async (_what, path) => {
      const response = await api.app.inject({ method: "GET", url: `/${path}` });

      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toBe("public, no-cache");
    });

    it("answers 304 when the client already holds the shell", async () => {
      const first = await api.app.inject({ method: "GET", url: "/" });
      const etag = first.headers["etag"];

      const second = await api.app.inject({
        method: "GET",
        url: "/",
        headers: { "if-none-match": String(etag) },
      });

      expect(second.statusCode).toBe(304);
      expect(second.body).toBe("");
    });

    it("answers 304 when the client already holds an asset", async () => {
      const first = await api.app.inject({ method: "GET", url: `/${HASHED_SCRIPT}` });
      const etag = first.headers["etag"];

      const second = await api.app.inject({
        method: "GET",
        url: `/${HASHED_SCRIPT}`,
        headers: { "if-none-match": String(etag) },
      });

      expect(second.statusCode).toBe(304);
      expect(second.body).toBe("");
    });

  });

  describe("the document is the one response with a content security policy that allows anything", () => {
    it("lets the shell load its own bundle, and nothing from anywhere else", async () => {
      const response = await api.app.inject({ method: "GET", url: "/" });
      const policy = String(response.headers["content-security-policy"]);

      expect(policy).toContain("default-src 'self'");
      expect(policy).toContain("script-src 'self'");
      expect(policy).toContain("frame-ancestors 'none'");
      // Photos are fetched with the session and handed to the DOM as object
      // URLs, so a blob is the only way an image is ever drawn here.
      expect(policy).toContain("blob:");
      expect(policy).not.toContain("unsafe-eval");
      expect(policy).not.toContain("script-src 'self' 'unsafe-inline'");
    });

    it("leaves every JSON answer under `default-src 'none'`", async () => {
      const response = await api.app.inject({ method: "GET", url: "/health" });

      expect(String(response.headers["content-security-policy"])).toContain(
        "default-src 'none'",
      );
    });
  });

  describe("nothing outside the built client is reachable", () => {
    it.each([
      ["a traversal", "/../ariadna-secret.txt"],
      ["an encoded traversal", "/%2e%2e/ariadna-secret.txt"],
      ["a deep encoded traversal", "/assets/%2e%2e/%2e%2e/ariadna-secret.txt"],
    ])("refuses %s with JSON, and never the file", async (_what, url) => {
      const secret = await createSecretBesideWebRoot(webRoot);

      try {
        const response = await api.app.inject({ method: "GET", url });

        expect(response.statusCode).toBe(404);
        expect(response.body).not.toContain("the session table");
        expect(response.headers["content-type"]).toContain("application/json");
      } finally {
        await rm(secret, { force: true });
      }
    });

    it("refuses a percent escape that decodes to nothing valid", async () => {
      // Fastify's own router refuses a malformed target before any of this
      // runs, which is the right layer for it. What matters here is that the
      // answer is a refusal in JSON and never a page.
      const response = await api.app.inject({ method: "GET", url: "/%zz" });

      expect(response.statusCode).toBe(400);
      expect(response.headers["content-type"]).toContain("application/json");
      expect(response.body).not.toContain(SHELL_MARKER);
    });
  });
});

describe("a web root with no build in it", () => {
  it("refuses to start, and says how to fix it", async () => {
    const empty = await mkdtemp(join(tmpdir(), "ariadna-empty-web-root-"));

    try {
      // At boot rather than on the first request. A container built without
      // the client is broken, and the log line at start is the only place
      // anybody is looking; a 404 in a garage is not.
      expect(() => createWebClient({ root: empty })).toThrow(MissingWebClient);
      expect(() => createWebClient({ root: empty })).toThrow(/index\.html/u);
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });
});

/**
 * The configuration every other test file in this suite runs under: no web
 * root, so the API is exactly the JSON service it was before.
 */
describe("an API with no web client behind it", () => {
  let api: TestApi;

  beforeAll(async () => {
    api = await createTestApi();
  });

  afterAll(async () => {
    await api.destroy();
  });

  it("answers JSON at the root rather than pretending to have a page", async () => {
    const response = await api.app.inject({ method: "GET", url: "/" });

    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  it("answers JSON for a client route too", async () => {
    const response = await api.app.inject({ method: "GET", url: "/u/ABCDEFGHJK" });

    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toContain("application/json");
  });
});
