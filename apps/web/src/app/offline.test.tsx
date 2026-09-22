import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sessionStore } from "../auth/session-store.js";
import { apiServer, API_URL } from "../testing/api-server.js";
import { aSession } from "@waymark/api-client/testing";
import { renderApp, screen, userEvent, waitFor } from "../testing/render-app.js";

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
      keys: async () => ["ariadna-photos", "workbox-precache-v2"],
      delete: async (name: string) => {
        deleted.push(name);

        return true;
      },
    });
    apiServer.use(
      http.post(`${API_URL}/auth/logout`, () => new HttpResponse(null, { status: 204 })),
    );

    renderApp({ route: "/" });

    await userEvent.click(await screen.findByRole("button", { name: /sign out/i }));

    await waitFor(() => {
      expect(deleted).toContain("ariadna-photos");
    });
    vi.unstubAllGlobals();
  });
});
