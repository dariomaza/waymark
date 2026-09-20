import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { sessionStore } from "../auth/session-store.js";
import { apiServer, API_URL } from "../testing/api-server.js";
import { aSession, aStorageUnit, aTree } from "@ariadna/api-client/testing";
import { renderApp, screen, userEvent, waitFor } from "../testing/render-app.js";

const garage = aStorageUnit({ id: "garage", name: "Garage", kind: "ROOM" });
const box = aStorageUnit({
  id: "box3",
  parentId: "garage",
  name: "Box 3",
  publicId: "7ZK3QWERTY",
});

const QR_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>';

describe("the label on a box", () => {
  beforeEach(() => {
    sessionStore.save(aSession());
    apiServer.use(
      http.get(`${API_URL}/auth/me`, () =>
        HttpResponse.json({ user: { id: "u1", username: "dario" } }),
      ),
      http.get(`${API_URL}/storage-units`, () =>
        HttpResponse.json({ tree: [aTree(garage, [aTree(box)])] }),
      ),
      http.get(`${API_URL}/storage-units/box3`, () =>
        HttpResponse.json({ unit: box, path: [garage, box], children: [], items: [] }),
      ),
      http.get(`${API_URL}/storage-units/box3/qr.svg`, () =>
        HttpResponse.text(QR_SVG, { headers: { "content-type": "image/svg+xml" } }),
      ),
    );
  });

  it("shows the symbol and the code a person can read out loud", async () => {
    renderApp({ route: "/units/box3/label" });

    expect(
      await screen.findByRole("img", { name: /qr code for box 3/i }),
    ).toBeInTheDocument();
    // Printed under the symbol so it can be read across a garage.
    expect(screen.getByText("7ZK3QWERTY")).toBeVisible();
    expect(screen.getByText("Garage > Box 3")).toBeVisible();
  });

  it("prints, because the whole point is sticking it on a box", async () => {
    const print = vi.fn();
    vi.stubGlobal("print", print);

    renderApp({ route: "/units/box3/label" });

    await userEvent.click(await screen.findByRole("button", { name: /print/i }));

    expect(print).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("is reachable from the unit itself", async () => {
    renderApp({ route: "/units/box3" });

    await userEvent.click(await screen.findByRole("link", { name: /label/i }));

    await waitFor(() => {
      expect(screen.getByText("7ZK3QWERTY")).toBeVisible();
    });
  });
});
