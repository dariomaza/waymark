import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { aSession, aStorageUnit, aTree, VIEW_ONLY } from "@waymark/api-client/testing";

import { sessionStore } from "../auth/session-store.js";
import { apiServer, API_URL } from "../testing/api-server.js";
import { renderApp, screen, within } from "../testing/render-app.js";

/**
 * # The home screen says whose each space is (ADR 26)
 *
 * An administrator sees every space in the house: their own first, then each
 * other person's under that person's name. A person sees their own, then
 * what was shared with them, and a space shared to look at says so.
 */

const DARIO = { id: "u1", username: "dario" };
const PARTNER = { id: "u2", username: "partner" };
const LODGER = { id: "u3", username: "lodger" };

const garage = aStorageUnit({ id: "garage", name: "Garage", kind: "ROOM" });
const attic = aStorageUnit({ id: "attic", name: "Attic", kind: "ROOM" });
const shed = aStorageUnit({ id: "shed", name: "Shed", kind: "ROOM" });
const studio = aStorageUnit({ id: "studio", name: "Studio", kind: "ROOM" });

const signedInAs = (
  who: { readonly id: string; readonly username: string },
  role: "administrator" | "user",
  tree: readonly ReturnType<typeof aTree>[],
): void => {
  apiServer.use(
    http.get(`${API_URL}/auth/me`, () => HttpResponse.json({ user: { ...who, role } })),
    http.get(`${API_URL}/storage-units`, () => HttpResponse.json({ tree, mayMakeRoot: true })),
  );
};

const namesIn = (list: HTMLElement): readonly string[] =>
  within(list)
    .getAllByRole("link")
    .map((link) => link.querySelector(".row-link__title")?.textContent ?? "");

describe("an administrator's home screen", () => {
  beforeEach(() => {
    sessionStore.save(aSession());
  });

  it("puts their own spaces first, then each person's under that person's name", async () => {
    signedInAs(DARIO, "administrator", [
      aTree(attic, [], { owner: PARTNER }),
      aTree(garage, [], { owner: DARIO }),
      aTree(shed, [], { owner: LODGER }),
    ]);
    renderApp({ route: "/" });

    const partners = await screen.findByRole("region", { name: "Spaces of partner" });
    const lodgers = screen.getByRole("region", { name: "Spaces of lodger" });

    expect(within(partners).getByRole("heading", { name: "partner" })).toBeVisible();
    expect(namesIn(partners)).toEqual(["Attic"]);
    expect(namesIn(lodgers)).toEqual(["Shed"]);

    const lists = screen.getAllByRole("list", { name: /storage units/i });
    expect(namesIn(lists[0] as HTMLElement)).toEqual(["Garage"]);
    expect(lists[1]).toBe(within(lodgers).getByRole("list", { name: /storage units/i }));
    expect(lists[2]).toBe(within(partners).getByRole("list", { name: /storage units/i }));
  });
});

describe("a person's home screen", () => {
  beforeEach(() => {
    sessionStore.save(aSession());
  });

  it("puts their own spaces first, then what was shared with them", async () => {
    signedInAs(PARTNER, "user", [
      aTree(garage, [], { shared: true, permissions: VIEW_ONLY }),
      aTree(attic),
    ]);
    renderApp({ route: "/" });

    const shared = await screen.findByRole("region", { name: "Shared with you" });

    expect(namesIn(shared)).toEqual(["Garage"]);
    const lists = screen.getAllByRole("list", { name: /storage units/i });
    expect(namesIn(lists[0] as HTMLElement)).toEqual(["Attic"]);
  });

  it("is never grouped by anybody's name, whatever the tree carries", async () => {
    signedInAs(PARTNER, "user", [
      aTree(garage, [], { shared: true, owner: DARIO }),
      aTree(attic),
    ]);
    renderApp({ route: "/" });

    await screen.findByRole("region", { name: "Shared with you" });
    expect(screen.queryByRole("region", { name: "Spaces of dario" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "dario" })).toBeNull();
  });

  it("marks a space shared to look at, and not one shared to change", async () => {
    signedInAs(PARTNER, "user", [
      aTree(garage, [], { shared: true, permissions: VIEW_ONLY }),
      aTree(studio, [], { shared: true }),
    ]);
    renderApp({ route: "/" });

    const shared = await screen.findByRole("region", { name: "Shared with you" });
    const garageRow = within(shared).getByRole("link", { name: /garage/i });
    const studioRow = within(shared).getByRole("link", { name: /studio/i });

    expect(within(garageRow).getByRole("img", { name: "View only" })).toBeInTheDocument();
    expect(within(studioRow).queryByRole("img", { name: "View only" })).toBeNull();
  });

  it("has no shared group when nothing was shared", async () => {
    signedInAs(PARTNER, "user", [aTree(attic)]);
    renderApp({ route: "/" });

    await screen.findByRole("link", { name: /attic/i });
    expect(screen.queryByRole("region", { name: "Shared with you" })).toBeNull();
  });
});
