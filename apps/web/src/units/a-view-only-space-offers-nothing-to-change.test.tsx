import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import {
  anItem,
  aSession,
  aStorageUnit,
  aTree,
  VIEW_ONLY,
  withPhoto,
} from "@waymark/api-client/testing";

import { sessionStore } from "../auth/session-store.js";
import { apiServer, API_URL } from "../testing/api-server.js";
import { renderApp, screen, userEvent, waitFor, within } from "../testing/render-app.js";

/**
 * # A space shared to look at offers nothing that would change it (ADR 26)
 *
 * The API refuses every change inside a view-only space; the client does not
 * offer one, so nobody is shown a button whose only answer is "no". Looking
 * stays: searching inside, the label, the photographs.
 *
 * The partner owns the garage and was shown the attic, view only.
 */

const garage = aStorageUnit({ id: "garage", name: "Garage", kind: "ROOM" });
const shelf = aStorageUnit({ id: "shelf", parentId: "garage", name: "Shelf" });
const attic = aStorageUnit({ id: "attic", name: "Attic", kind: "ROOM" });
const trunk = aStorageUnit({ id: "trunk", parentId: "attic", name: "Trunk" });
const lamp = anItem({ id: "lamp", storageUnitId: "attic", name: "Lamp", photos: ["p2", "p3"] });
const drill = anItem({ id: "drill", storageUnitId: "shelf", name: "Drill" });

const ALL_BUT_THE_TOP = { access: "edit", mayMove: true, mayMoveToTop: false } as const;

const bytes = (): HttpResponse<ArrayBuffer> =>
  new HttpResponse(new Uint8Array([1, 2, 3]).buffer, { headers: { "content-type": "image/png" } });

const theHouse = ({
  mayMakeRoot = true,
  shelfPermissions,
}: {
  readonly mayMakeRoot?: boolean;
  readonly shelfPermissions?: typeof ALL_BUT_THE_TOP;
} = {}): void => {
  apiServer.use(
    http.get(`${API_URL}/auth/me`, () =>
      HttpResponse.json({ user: { id: "u2", username: "partner", role: "user" } }),
    ),
    http.get(`${API_URL}/storage-units`, () =>
      HttpResponse.json({
        tree: [
          aTree(garage, [
            aTree(shelf, [], shelfPermissions === undefined ? {} : { permissions: shelfPermissions }),
          ]),
          aTree(attic, [aTree(trunk, [], { permissions: VIEW_ONLY })], {
            permissions: VIEW_ONLY,
            shared: true,
          }),
        ],
        mayMakeRoot,
      }),
    ),
    http.get(`${API_URL}/storage-units/attic`, () =>
      HttpResponse.json({
        unit: withPhoto(attic, "p1"),
        path: [attic],
        children: [trunk],
        items: [lamp],
      }),
    ),
    http.get(`${API_URL}/storage-units/garage`, () =>
      HttpResponse.json({ unit: withPhoto(garage), path: [garage], children: [shelf], items: [] }),
    ),
    http.get(`${API_URL}/storage-units/shelf`, () =>
      HttpResponse.json({ unit: withPhoto(shelf), path: [garage, shelf], children: [], items: [drill] }),
    ),
    http.get(`${API_URL}/items/lamp`, () =>
      HttpResponse.json({ item: lamp, storageUnit: attic, path: [attic] }),
    ),
    http.get(`${API_URL}/items/drill`, () =>
      HttpResponse.json({ item: drill, storageUnit: shelf, path: [garage, shelf] }),
    ),
    http.get(`${API_URL}/photos/:id`, bytes),
    http.get(`${API_URL}/photos/:id/thumbnail`, bytes),
  );
};

const openTheMenuFor = async (name: string): Promise<HTMLElement> => {
  await userEvent.click(await screen.findByRole("button", { name: `More actions for ${name}` }));

  return await screen.findByRole("dialog", { name: `More actions for ${name}` });
};

const optionsOf = (picker: HTMLElement): readonly string[] =>
  within(picker)
    .getAllByRole("option")
    .map((option) => option.textContent ?? "");

describe("a space shared to look at", () => {
  beforeEach(() => {
    sessionStore.save(aSession());
  });

  it("says it is view only, under its name", async () => {
    theHouse();
    renderApp({ route: "/units/attic" });

    await screen.findByRole("heading", { name: "Attic" });
    expect(await screen.findByText("View only")).toBeVisible();
  });

  it("offers searching inside it, and not adding an item to it", async () => {
    theHouse();
    renderApp({ route: "/units/attic" });

    expect(await screen.findByRole("link", { name: "Search inside" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add an item" })).toBeNull();
  });

  it("keeps its label in its menu, and nothing that would change it", async () => {
    theHouse();
    renderApp({ route: "/units/attic" });

    const menu = await openTheMenuFor("Attic");

    expect(within(menu).getByRole("link", { name: "Show the label" })).toBeVisible();
    for (const act of ["Add a space inside", "Edit", "Move", "Empty", "Delete"]) {
      expect(within(menu).queryByRole("button", { name: act })).toBeNull();
    }
  });

  it("shows its photo without offering to replace or remove it", async () => {
    theHouse();
    renderApp({ route: "/units/attic" });

    expect(await screen.findByRole("img", { name: /attic/i })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Replace the photo" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove this photo" })).toBeNull();
  });

  it("does not let the things in it be picked for moving", async () => {
    theHouse();
    renderApp({ route: "/units/attic" });

    await screen.findByRole("link", { name: /lamp/i });
    expect(screen.queryByRole("checkbox", { name: "Select Lamp" })).toBeNull();
  });

  it("lets a thing in it be looked at, and not edited, moved or deleted", async () => {
    theHouse();
    renderApp({ route: "/things/lamp" });

    await screen.findByRole("heading", { name: "Lamp" });
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Move" })).toBeNull();
    expect(screen.queryByRole("button", { name: "More actions for Lamp" })).toBeNull();
  });

  it("shows a thing's photos without offering to add, reorder or delete them", async () => {
    theHouse();
    renderApp({ route: "/things/lamp" });

    const gallery = await screen.findByRole("list", { name: /photos/i });
    expect(within(gallery).getAllByRole("img")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /add a photo/i })).toBeNull();
    expect(within(gallery).queryAllByRole("button")).toHaveLength(0);
  });
});

describe("where something may be put", () => {
  beforeEach(() => {
    sessionStore.save(aSession());
  });

  it("lists only the spaces the person may change when moving a space", async () => {
    theHouse();
    renderApp({ route: "/units/shelf" });

    const menu = await openTheMenuFor("Shelf");
    await userEvent.click(within(menu).getByRole("button", { name: "Move" }));
    const picker = await screen.findByRole("combobox", { name: "Move it into" });

    await waitFor(() => {
      expect(optionsOf(picker)).toContain("Garage");
    });
    expect(optionsOf(picker).some((name) => name.includes("Attic"))).toBe(false);
    expect(optionsOf(picker)).toContain("Nowhere — make it a root");
  });

  it("does not offer the top level when the space may not go there", async () => {
    theHouse({ shelfPermissions: ALL_BUT_THE_TOP });
    renderApp({ route: "/units/shelf" });

    const menu = await openTheMenuFor("Shelf");
    await userEvent.click(within(menu).getByRole("button", { name: "Move" }));
    const picker = await screen.findByRole("combobox", { name: "Move it into" });

    await waitFor(() => {
      expect(optionsOf(picker)).toContain("Garage");
    });
    expect(optionsOf(picker)).not.toContain("Nowhere — make it a root");
  });

  it("lists only the spaces the person may change when moving a thing", async () => {
    theHouse();
    renderApp({ route: "/things/drill" });

    await userEvent.click(await screen.findByRole("button", { name: "Move" }));
    const picker = await screen.findByRole("combobox", { name: "Move it into" });

    await waitFor(() => {
      expect(optionsOf(picker)).toContain("Garage > Shelf");
    });
    expect(optionsOf(picker).some((name) => name.includes("Attic"))).toBe(false);
  });

  it("lists only the spaces the person may change when emptying a space", async () => {
    theHouse();
    renderApp({ route: "/units/garage" });

    const menu = await openTheMenuFor("Garage");
    await userEvent.click(within(menu).getByRole("button", { name: "Empty" }));
    const picker = await screen.findByRole("combobox", { name: /move everything into/i });

    await waitFor(() => {
      expect(optionsOf(picker)).toContain("Garage > Shelf");
    });
    expect(optionsOf(picker).some((name) => name.includes("Attic"))).toBe(false);
  });

  it("does not offer a new top-level space when none may be made", async () => {
    theHouse({ mayMakeRoot: false });
    renderApp({ route: "/" });

    await screen.findByRole("link", { name: /garage/i });
    expect(screen.queryByRole("button", { name: "Add a space" })).toBeNull();
  });

  it("offers a new top-level space when one may be made", async () => {
    theHouse();
    renderApp({ route: "/" });

    expect(await screen.findByRole("button", { name: "Add a space" })).toBeVisible();
  });
});
