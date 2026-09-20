import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { sessionStore } from "../auth/session-store.js";
import { apiServer, API_URL } from "../testing/api-server.js";
import { anItem, aSession, aStorageUnit, aTree } from "../testing/fixtures.js";
import { renderApp, screen, userEvent } from "../testing/render-app.js";

const garage = aStorageUnit({ id: "garage", name: "Garage", kind: "ROOM" });
const box = aStorageUnit({
  id: "box3",
  parentId: "garage",
  name: "Box 3",
  publicId: "7ZK3QWERTY",
});

const theApiKnowsTheHouse = (): void => {
  apiServer.use(
    http.get(`${API_URL}/auth/me`, () =>
      HttpResponse.json({ user: { id: "u1", username: "dario" } }),
    ),
    http.get(`${API_URL}/storage-units`, () =>
      HttpResponse.json({ tree: [aTree(garage, [aTree(box)])] }),
    ),
    http.get(`${API_URL}/storage-units/box3`, () =>
      HttpResponse.json({
        unit: box,
        path: [garage, box],
        children: [],
        items: [anItem({ id: "drill", storageUnitId: "box3", name: "Cordless drill" })],
      }),
    ),
  );
};

/**
 * The URL printed on every label. Android's stock camera opens it directly,
 * which means this path has to work for somebody who has never opened the app
 * on this phone.
 */
const SCANNED = "/u/7ZK3QWERTY";

describe("a label scanned with the phone's own camera", () => {
  it("opens the box it names", async () => {
    sessionStore.save(aSession());
    theApiKnowsTheHouse();

    renderApp({ route: SCANNED });

    expect(await screen.findByRole("heading", { name: "Box 3" })).toBeVisible();
    expect(screen.getByRole("link", { name: /cordless drill/i })).toBeVisible();
  });

  it("asks a stranger to sign in and then opens that same box", async () => {
    theApiKnowsTheHouse();
    apiServer.use(
      http.post(`${API_URL}/auth/login`, () =>
        HttpResponse.json({
          token: "a-fresh-token",
          expiresAt: "2099-01-01T00:00:00.000Z",
          user: { id: "u1", username: "dario" },
        }),
      ),
    );

    renderApp({ route: SCANNED });

    await userEvent.type(
      await screen.findByRole("textbox", { name: /username/i }),
      "dario",
    );
    await userEvent.type(screen.getByLabelText(/password/i), "correct horse");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    // Not the home screen. The box that was scanned, which is the only reason
    // anybody pointed a camera at a sticker.
    expect(await screen.findByRole("heading", { name: "Box 3" })).toBeVisible();
  });

  it("says so plainly when no box in the house carries that code", async () => {
    sessionStore.save(aSession());
    theApiKnowsTheHouse();

    renderApp({ route: "/u/NOTALABEL0" });

    expect(await screen.findByText(/no unit in this inventory/i)).toBeVisible();
    expect(screen.getByRole("link", { name: /inventory/i })).toBeVisible();
  });

  it("offers to try again when the code cannot be looked up at all", async () => {
    sessionStore.save(aSession());
    apiServer.use(
      http.get(`${API_URL}/auth/me`, () =>
        HttpResponse.json({ user: { id: "u1", username: "dario" } }),
      ),
      http.get(`${API_URL}/storage-units`, () => HttpResponse.error()),
    );

    renderApp({ route: SCANNED });

    expect(await screen.findByText(/could not reach ariadna/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /try again/i })).toBeVisible();
  });
});
