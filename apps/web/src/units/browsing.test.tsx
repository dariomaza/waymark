import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { sessionStore } from "../auth/session-store.js";
import { apiServer, API_URL } from "../testing/api-server.js";
import { anItem, aSession, aStorageUnit, aTree } from "@ariadna/api-client/testing";
import { renderApp, screen, userEvent, within } from "../testing/render-app.js";

const garage = aStorageUnit({ id: "garage", name: "Garage", kind: "ROOM" });
const wardrobe = aStorageUnit({
  id: "wardrobe",
  parentId: "garage",
  name: "Metal wardrobe",
  kind: "FURNITURE",
});
const box = aStorageUnit({ id: "box3", parentId: "wardrobe", name: "Box 3" });

const signedIn = (): void => {
  sessionStore.save(aSession());
  apiServer.use(
    http.get(`${API_URL}/auth/me`, () =>
      HttpResponse.json({ user: { id: "u1", username: "dario" } }),
    ),
  );
};

const theForestIs = (...tree: unknown[]): void => {
  apiServer.use(http.get(`${API_URL}/storage-units`, () => HttpResponse.json({ tree })));
};

describe("browsing the inventory", () => {
  beforeEach(signedIn);

  it("shows the whole house, nested the way it is stored", async () => {
    theForestIs(aTree(garage, [aTree(wardrobe, [aTree(box)])]));

    renderApp({ route: "/" });

    const tree = await screen.findByRole("list", { name: /storage units/i });
    expect(within(tree).getByRole("link", { name: /garage/i })).toBeVisible();
    expect(within(tree).getByRole("link", { name: /metal wardrobe/i })).toBeVisible();
    expect(within(tree).getByRole("link", { name: /box 3/i })).toBeVisible();
  });

  it("says the house is empty rather than drawing an empty list", async () => {
    theForestIs();

    renderApp({ route: "/" });

    expect(await screen.findByText(/nothing stored yet/i)).toBeVisible();
  });

  it("offers a way to try again when the inventory cannot be loaded", async () => {
    apiServer.use(http.get(`${API_URL}/storage-units`, () => HttpResponse.error()));

    renderApp({ route: "/" });

    expect(await screen.findByText(/could not reach ariadna/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /try again/i })).toBeVisible();
  });

  it("opens a unit and shows what is inside it, and where it is", async () => {
    theForestIs(aTree(garage, [aTree(wardrobe, [aTree(box)])]));
    apiServer.use(
      http.get(`${API_URL}/storage-units/box3`, () =>
        HttpResponse.json({
          unit: box,
          path: [garage, wardrobe, box],
          children: [],
          items: [anItem({ id: "drill", storageUnitId: "box3", name: "Cordless drill" })],
        }),
      ),
    );

    renderApp({ route: "/" });
    await userEvent.click(await screen.findByRole("link", { name: /box 3/i }));

    expect(await screen.findByRole("heading", { name: "Box 3" })).toBeVisible();
    const trail = screen.getByRole("navigation", { name: /breadcrumb/i });
    expect(within(trail).getByRole("link", { name: "Garage" })).toBeVisible();
    expect(within(trail).getByRole("link", { name: "Metal wardrobe" })).toBeVisible();
    expect(screen.getByRole("link", { name: /cordless drill/i })).toBeVisible();
  });

  it("says a box is empty instead of showing two empty lists", async () => {
    apiServer.use(
      http.get(`${API_URL}/storage-units/box3`, () =>
        HttpResponse.json({ unit: box, path: [box], children: [], items: [] }),
      ),
    );

    renderApp({ route: "/units/box3" });

    expect(await screen.findByText(/this one is empty/i)).toBeVisible();
  });

  it("says plainly when the box a link points at is gone", async () => {
    apiServer.use(
      http.get(`${API_URL}/storage-units/box3`, () =>
        HttpResponse.json(
          {
            error: {
              code: "STORAGE_UNIT_NOT_FOUND",
              message: "storage unit box3 was not found",
            },
          },
          { status: 404 },
        ),
      ),
    );

    renderApp({ route: "/units/box3" });

    expect(await screen.findByText(/is not here/i)).toBeVisible();
  });

  it("opens an item and answers where it is", async () => {
    apiServer.use(
      http.get(`${API_URL}/items/drill`, () =>
        HttpResponse.json({
          item: anItem({
            id: "drill",
            storageUnitId: "box3",
            name: "Cordless drill",
            quantity: 2,
            tags: ["tools", "power"],
            description: "18V, two batteries",
          }),
          storageUnit: box,
          path: [garage, wardrobe, box],
        }),
      ),
    );

    renderApp({ route: "/items/drill" });

    expect(await screen.findByRole("heading", { name: "Cordless drill" })).toBeVisible();

    const trail = screen.getByRole("navigation", { name: /breadcrumb/i });
    expect(within(trail).getByRole("link", { name: "Garage" })).toBeVisible();
    // The unit holding it is a link too: from an item, "where is it" is
    // somewhere you want to be able to tap.
    expect(within(trail).getByRole("link", { name: "Box 3" })).toBeVisible();

    expect(screen.getByText(/18V, two batteries/)).toBeVisible();
    expect(screen.getByText("Quantity 2")).toBeVisible();
    expect(
      within(screen.getByRole("list", { name: /tags/i })).getByText("tools"),
    ).toBeVisible();
  });
});
