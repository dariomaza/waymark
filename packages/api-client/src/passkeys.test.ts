import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ApiError, ApiErrorCode } from "./api-error.js";
import { queryKeys } from "./query-keys.js";
import { createWaymarkClient } from "./waymark-client.js";

/**
 * # The six calls a passkey needs, from the client both apps share
 *
 * Run against MSW answering the way `apps/api` does, so a shape that would
 * break the sign-in screen breaks here first — without a browser, which is the
 * only way anything in this package is ever tested.
 *
 * The thing worth being careful about here is the opposite of the machine
 * token's. There, the secret came back on two calls and had to go nowhere. A
 * passkey has no secret to hand back at all: the private half never leaves the
 * authenticator, which is why these responses can be so plain.
 */
const API_URL = "http://127.0.0.1:3000";

const apiServer = setupServer();

beforeAll(() => {
  apiServer.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  apiServer.resetHandlers();
});
afterAll(() => {
  apiServer.close();
});

const client = (token: string | null = "a-live-token") =>
  createWaymarkClient<File>({
    baseUrl: API_URL,
    token: () => token,
    appendPhoto: (form, field, file) => {
      form.append(field, file, file.name);
    },
  });

const aPasskeyView = (overrides: Record<string, unknown> = {}) => ({
  id: "pk1",
  label: "Pixel 8",
  createdAt: "2026-04-01T10:00:00.000Z",
  lastUsedAt: null,
  ...overrides,
});

/** Stands in for whatever the platform hands back. This client never reads it. */
const aCredential = { id: "credential-1", response: {}, type: "public-key" };

describe("registering a passkey from a client", () => {
  it("asks for the ceremony on the route a password-backed session may use", async () => {
    const seen: string[] = [];
    apiServer.use(
      http.post(`${API_URL}/auth/passkeys/options`, ({ request }) => {
        seen.push(request.headers.get("authorization") ?? "");

        return HttpResponse.json({ ceremonyId: "c1", options: { challenge: "x" } });
      }),
    );

    const started = await client().beginPasskeyRegistration();

    expect(seen).toEqual(["Bearer a-live-token"]);
    expect(started.ceremonyId).toBe("c1");
  });

  /**
   * The options are handed straight to the browser's own library, so this
   * client passes them through untouched: reshaping them here would be this
   * package inventing an opinion about a specification it does not implement.
   */
  it("hands the options through exactly as the API sent them", async () => {
    apiServer.use(
      http.post(`${API_URL}/auth/passkeys/options`, () =>
        HttpResponse.json({
          ceremonyId: "c1",
          options: { challenge: "x", rp: { id: "waymark.example" }, timeout: 60000 },
        }),
      ),
    );

    const started = await client().beginPasskeyRegistration();

    expect(started.options).toEqual({
      challenge: "x",
      rp: { id: "waymark.example" },
      timeout: 60000,
    });
  });

  it("sends the ceremony, the name and the credential back together", async () => {
    let body: unknown;
    apiServer.use(
      http.post(`${API_URL}/auth/passkeys`, async ({ request }) => {
        body = await request.json();

        return HttpResponse.json({ passkey: aPasskeyView() }, { status: 201 });
      }),
    );

    await client().finishPasskeyRegistration({
      ceremonyId: "c1",
      label: "Pixel 8",
      credential: aCredential,
    });

    expect(body).toEqual({
      ceremonyId: "c1",
      label: "Pixel 8",
      credential: aCredential,
    });
  });

  it("answers the device as the list will show it", async () => {
    apiServer.use(
      http.post(`${API_URL}/auth/passkeys`, () =>
        HttpResponse.json({ passkey: aPasskeyView({ label: "Work laptop" }) }, { status: 201 }),
      ),
    );

    const { passkey } = await client().finishPasskeyRegistration({
      ceremonyId: "c1",
      label: "Work laptop",
      credential: aCredential,
    });

    expect(passkey.label).toBe("Work laptop");
    expect(passkey.lastUsedAt).toBeNull();
  });

  it("passes on a refusal that says the session needs a password", async () => {
    apiServer.use(
      http.post(`${API_URL}/auth/passkeys/options`, () =>
        HttpResponse.json(
          {
            error: {
              code: "PASSKEY_NEEDS_A_PASSWORD",
              message: "adding a passkey needs your password",
            },
          },
          { status: 403 },
        ),
      ),
    );

    await expect(client().beginPasskeyRegistration()).rejects.toMatchObject({
      code: ApiErrorCode.PASSKEY_NEEDS_A_PASSWORD,
      status: 403,
    });
  });
});

describe("signing in with a passkey from a client", () => {
  /**
   * Nobody is signed in yet, so there is no token to send — and the route
   * answers the same thing to everybody either way (ADR 19).
   */
  it("asks for a ceremony with no session at all", async () => {
    const seen: (string | null)[] = [];
    apiServer.use(
      http.post(`${API_URL}/auth/passkey-login/options`, ({ request }) => {
        seen.push(request.headers.get("authorization"));

        return HttpResponse.json({ ceremonyId: "c1", options: { challenge: "x" } });
      }),
    );

    await client(null).beginPasskeyLogin();

    expect(seen).toEqual([null]);
  });

  it("sends the ceremony and the assertion back", async () => {
    let body: unknown;
    apiServer.use(
      http.post(`${API_URL}/auth/passkey-login`, async ({ request }) => {
        body = await request.json();

        return HttpResponse.json({
          token: "a-fresh-token",
          expiresAt: "2026-05-01T10:00:00.000Z",
          user: { id: "u1", username: "dario" },
        });
      }),
    );

    await client(null).finishPasskeyLogin({ ceremonyId: "c1", credential: aCredential });

    expect(body).toEqual({ ceremonyId: "c1", credential: aCredential });
  });

  /**
   * ADR 6: one mechanism. The answer is the same `SessionView` a password
   * produces, so everything above this in both apps is unchanged.
   */
  it("answers exactly the session a password answers", async () => {
    apiServer.use(
      http.post(`${API_URL}/auth/passkey-login`, () =>
        HttpResponse.json({
          token: "a-fresh-token",
          expiresAt: "2026-05-01T10:00:00.000Z",
          user: { id: "u1", username: "dario" },
        }),
      ),
    );

    const session = await client(null).finishPasskeyLogin({
      ceremonyId: "c1",
      credential: aCredential,
    });

    expect(session).toEqual({
      token: "a-fresh-token",
      expiresAt: "2026-05-01T10:00:00.000Z",
      user: { id: "u1", username: "dario" },
    });
  });

  it("recognises the refusal that names a device as possibly copied", async () => {
    apiServer.use(
      http.post(`${API_URL}/auth/passkey-login`, () =>
        HttpResponse.json(
          {
            error: {
              code: "CLONED_PASSKEY",
              message: "counter went backwards",
              details: { label: "Pixel 8" },
            },
          },
          { status: 401 },
        ),
      ),
    );

    const failure = await client(null)
      .finishPasskeyLogin({ ceremonyId: "c1", credential: aCredential })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).code).toBe(ApiErrorCode.CLONED_PASSKEY);
    expect((failure as ApiError).details["label"]).toBe("Pixel 8");
  });

  it("recognises a ceremony that has expired", async () => {
    apiServer.use(
      http.post(`${API_URL}/auth/passkey-login`, () =>
        HttpResponse.json(
          { error: { code: "PASSKEY_CEREMONY_EXPIRED", message: "start again" } },
          { status: 422 },
        ),
      ),
    );

    await expect(
      client(null).finishPasskeyLogin({ ceremonyId: "c1", credential: aCredential }),
    ).rejects.toMatchObject({ code: ApiErrorCode.PASSKEY_CEREMONY_EXPIRED });
  });
});

describe("the devices on an account", () => {
  it("lists them", async () => {
    apiServer.use(
      http.get(`${API_URL}/auth/passkeys`, () =>
        HttpResponse.json({
          passkeys: [aPasskeyView(), aPasskeyView({ id: "pk2", label: "Work laptop" })],
        }),
      ),
    );

    const { passkeys } = await client().passkeys();

    expect(passkeys.map((one) => one.label)).toEqual(["Pixel 8", "Work laptop"]);
  });

  it("removes one at a time, by its id", async () => {
    const seen: string[] = [];
    apiServer.use(
      http.delete(`${API_URL}/auth/passkeys/:id`, ({ params, request }) => {
        seen.push(`${request.method} ${String(params["id"])}`);

        return new HttpResponse(null, { status: 204 });
      }),
    );

    await client().removePasskey("pk1");

    expect(seen).toEqual(["DELETE pk1"]);
  });

  it("escapes an id rather than pasting it into a path", async () => {
    const seen: string[] = [];
    apiServer.use(
      http.delete(`${API_URL}/auth/passkeys/:id`, ({ params }) => {
        seen.push(String(params["id"]));

        return new HttpResponse(null, { status: 204 });
      }),
    );

    await client().removePasskey("pk 1/2");

    expect(seen).toEqual(["pk 1/2"]);
  });

  it("passes on a 404 for a device that is not there", async () => {
    apiServer.use(
      http.delete(`${API_URL}/auth/passkeys/:id`, () =>
        HttpResponse.json(
          { error: { code: "PASSKEY_NOT_FOUND", message: "no such passkey" } },
          { status: 404 },
        ),
      ),
    );

    await expect(client().removePasskey("pk1")).rejects.toMatchObject({
      code: ApiErrorCode.PASSKEY_NOT_FOUND,
      status: 404,
    });
  });

  /**
   * A device list is account state, not inventory: removing one must not
   * refetch the forest, and moving a box must not refetch this.
   */
  it("has a cache key of its own, outside the inventory graph", () => {
    expect(queryKeys.passkeys()).toEqual(["passkeys"]);
  });
});
