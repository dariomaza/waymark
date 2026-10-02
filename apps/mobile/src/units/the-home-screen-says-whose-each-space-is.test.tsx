import { aSession, aStorageUnit, aTree, VIEW_ONLY } from "@waymark/api-client/testing";

import { API_URL, apiServer, http, HttpResponse } from "../testing/api-server.js";
import { renderApp, screen, within } from "../testing/render-app.js";

/**
 * # The home screen says whose each space is (ADR 26)
 *
 * An administrator sees every space in the house: their own first, then each
 * other person's under that person's name. A person sees their own, then
 * what was shared with them, and a space shared to look at says so. The same
 * claims as the browser's test of the same name.
 */

const DARIO = { id: "u1", username: "dario" };
const PARTNER = { id: "u2", username: "partner" };
const LODGER = { id: "u3", username: "lodger" };

const garage = aStorageUnit({ id: "garage", name: "Garage", kind: "ROOM" });
const attic = aStorageUnit({ id: "attic", name: "Attic", kind: "ROOM" });
const shed = aStorageUnit({ id: "shed", name: "Shed", kind: "ROOM" });
const studio = aStorageUnit({ id: "studio", name: "Studio", kind: "ROOM" });

const atHome = { name: "Tabs", params: { screen: "Inventory" } } as const;

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

type Scope = Pick<typeof screen, "getAllByRole">;

/** The spaces a part of the screen lists, top to bottom, by name. */
const namesIn = (scope: Scope): readonly string[] =>
  scope
    .getAllByRole("link")
    .map((link) => String(link.props.accessibilityLabel).split(",")[0] ?? "");

/** One row of the tree: its link and whatever is drawn beside it. */
const theRowOf = (
  scope: ReturnType<typeof within>,
  name: RegExp,
): ReturnType<typeof within> => {
  const link = scope.getByRole("link", { name });
  const row = link.parent;
  if (row === null) {
    throw new Error(`No row around ${String(name)}`);
  }

  return within(row);
};

describe("an administrator's home screen", () => {
  it("puts their own spaces first, then each person's under that person's name", async () => {
    signedInAs(DARIO, "administrator", [
      aTree(attic, [], { owner: PARTNER }),
      aTree(garage, [], { owner: DARIO }),
      aTree(shed, [], { owner: LODGER }),
    ]);
    await renderApp({ session: aSession(), screen: atHome });

    const partners = within(await screen.findByLabelText("Spaces of partner"));
    const lodgers = within(screen.getByLabelText("Spaces of lodger"));

    expect(partners.getByRole("header", { name: "partner" })).toBeOnTheScreen();
    expect(namesIn(partners)).toEqual(["Attic"]);
    expect(namesIn(lodgers)).toEqual(["Shed"]);
    expect(namesIn(screen)).toEqual(["Garage", "Shed", "Attic"]);
    expect(screen.queryByLabelText("Shared with you")).toBeNull();
  });
});

describe("a person's home screen", () => {
  it("puts their own spaces first, then what was shared with them", async () => {
    signedInAs(PARTNER, "user", [
      aTree(garage, [], { shared: true, permissions: VIEW_ONLY }),
      aTree(attic),
    ]);
    await renderApp({ session: aSession(), screen: atHome });

    const shared = within(await screen.findByLabelText("Shared with you"));

    expect(shared.getByRole("header", { name: "Shared with you" })).toBeOnTheScreen();
    expect(namesIn(shared)).toEqual(["Garage"]);
    expect(namesIn(screen)).toEqual(["Attic", "Garage"]);
  });

  it("is never grouped by anybody's name, whatever the tree carries", async () => {
    signedInAs(PARTNER, "user", [
      aTree(garage, [], { shared: true, owner: DARIO }),
      aTree(attic),
    ]);
    await renderApp({ session: aSession(), screen: atHome });

    await screen.findByLabelText("Shared with you");
    expect(screen.queryByLabelText("Spaces of dario")).toBeNull();
    expect(screen.queryByRole("header", { name: "dario" })).toBeNull();
  });

  it("marks a space shared to look at, and not one shared to change", async () => {
    signedInAs(PARTNER, "user", [
      aTree(garage, [], { shared: true, permissions: VIEW_ONLY }),
      aTree(studio, [], { shared: true }),
    ]);
    await renderApp({ session: aSession(), screen: atHome });

    const shared = within(await screen.findByLabelText("Shared with you"));

    expect(namesIn(shared)).toEqual(["Garage", "Studio"]);
    expect(theRowOf(shared, /Garage/).queryByRole("image", { name: "View only" })).not.toBeNull();
    expect(theRowOf(shared, /Studio/).queryByRole("image", { name: "View only" })).toBeNull();
  });

  it("has no shared group when nothing was shared", async () => {
    signedInAs(PARTNER, "user", [aTree(attic)]);
    await renderApp({ session: aSession(), screen: atHome });

    await screen.findByRole("link", { name: /Attic/ });
    expect(screen.queryByLabelText("Shared with you")).toBeNull();
  });
});
