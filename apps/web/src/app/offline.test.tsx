import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sessionStore } from "../auth/session-store.js";
import { apiServer, API_URL } from "../testing/api-server.js";
import { aSession } from "@waymark/api-client/testing";
import { renderApp, screen, userEvent, waitFor } from "../testing/render-app.js";
import { createQueryClient, OFFLINE_RETRY_DELAY_MS } from "./app.js";

const signedIn = (): void => {
  sessionStore.save(aSession());
  apiServer.use(
    http.get(`${API_URL}/auth/me`, () =>
      HttpResponse.json({ user: { id: "u1", username: "dario" } }),
    ),
    http.get(`${API_URL}/storage-units`, () => HttpResponse.json({ tree: [] })),
  );
};

const goOffline = (): void => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  globalThis.dispatchEvent(new Event("offline"));
};

const comeBack = (): void => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  globalThis.dispatchEvent(new Event("online"));
};

describe("being offline", () => {
  beforeEach(signedIn);
  afterEach(() => {
    vi.restoreAllMocks();
    // The browser's own idea of being online is global state; put it back.
    globalThis.dispatchEvent(new Event("online"));
  });

  it("says so, and says what still works", async () => {
    renderApp({ route: "/" });
    await screen.findByRole("heading", { name: /your inventory/i });

    goOffline();

    const note = await screen.findByRole("status", { name: /connection/i });
    expect(note).toHaveTextContent(/offline/i);
    expect(note).toHaveTextContent(/nothing you change will be saved/i);
  });

  it("stops saying so the moment the connection comes back", async () => {
    renderApp({ route: "/" });
    await screen.findByRole("heading", { name: /your inventory/i });

    goOffline();
    await screen.findByRole("status", { name: /connection/i });

    comeBack();

    await waitFor(() => {
      expect(screen.queryByRole("status", { name: /connection/i })).toBeNull();
    });
  });
});

describe("signing out on a shared phone", () => {
  beforeEach(signedIn);

  it("throws away the cached photos and pages, not just the token", async () => {
    const deleted: string[] = [];
    vi.stubGlobal("caches", {
      keys: async () => ["waymark-photos", "workbox-precache-v2"],
      delete: async (name: string) => {
        deleted.push(name);

        return true;
      },
    });
    apiServer.use(
      http.post(`${API_URL}/auth/logout`, () => new HttpResponse(null, { status: 204 })),
      // The account screen asks for both kinds of credential a person manages
      // there: the machine tokens and the passkeys (ADR 19).
      http.get(`${API_URL}/auth/machine-tokens`, () =>
        HttpResponse.json({ machineTokens: [] }),
      ),
      http.get(`${API_URL}/auth/passkeys`, () => HttpResponse.json({ passkeys: [] })),
    );

    // The way out lives on the account destination now, with everything else
    // that is about the person rather than about the inventory.
    renderApp({ route: "/you" });

    await userEvent.click(await screen.findByRole("button", { name: /sign out/i }));

    await waitFor(() => {
      expect(deleted).toContain("waymark-photos");
    });
    vi.unstubAllGlobals();
  });
});

/**
 * # The one automatic retry, and the wait before it
 *
 * A request that never left the phone is asked once more before a screen
 * gives up (see `createQueryClient`). On a phone that second attempt waits
 * half a second. In a test that wait is wall-clock time, and it used to be
 * spent inside the one second a `findBy…` allows: any stall of the test
 * process during it — a loaded CI runner descheduling the worker — let the
 * retry and the assertion's deadline fall due together, and the deadline won.
 * That is the flake CI showed on the scanned-label screen, at 26 and 49
 * seconds. So the tests keep the retry and drop the wait.
 */
describe("a request that never left the phone", () => {
  beforeEach(() => {
    sessionStore.save(aSession());
  });

  const theInventoryIsUnreachable = (): number[] => {
    const attempts: number[] = [];
    apiServer.use(
      http.get(`${API_URL}/auth/me`, () =>
        HttpResponse.json({ user: { id: "u1", username: "dario" } }),
      ),
      http.get(`${API_URL}/storage-units`, () => {
        attempts.push(performance.now());

        return HttpResponse.error();
      }),
    );

    return attempts;
  };

  it("is asked once more, and only once, before the screen says it could not reach Waymark", async () => {
    const attempts = theInventoryIsUnreachable();

    renderApp({ route: "/" });

    expect(await screen.findByText(/could not reach waymark/i)).toBeVisible();
    expect(attempts).toHaveLength(2);
  });

  it("waits half a second before asking again on a phone", () => {
    expect(createQueryClient().getDefaultOptions().queries?.retryDelay).toBe(
      OFFLINE_RETRY_DELAY_MS,
    );
    expect(OFFLINE_RETRY_DELAY_MS).toBe(500);
  });

  it("is asked again at once in a test, so no assertion races the wait", async () => {
    const attempts = theInventoryIsUnreachable();

    renderApp({ route: "/" });

    await screen.findByText(/could not reach waymark/i);
    const [first = 0, second = 0] = attempts;
    expect(second - first).toBeLessThan(OFFLINE_RETRY_DELAY_MS);
  });
});
