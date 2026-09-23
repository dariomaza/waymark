import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { languageStore } from "../app/language.js";
import { sessionStore } from "../auth/session-store.js";
import { apiServer, API_URL } from "../testing/api-server.js";
import { anItem, aSession, aStorageUnit, aTree, withPhoto } from "@waymark/api-client/testing";
import { renderApp, screen, userEvent, waitFor, within } from "../testing/render-app.js";

const garage = aStorageUnit({ id: "garage", name: "Garage", kind: "ROOM" });
const wardrobe = aStorageUnit({
  id: "wardrobe",
  parentId: "garage",
  name: "Metal wardrobe",
  kind: "FURNITURE",
});
const box = aStorageUnit({ id: "box3", parentId: "wardrobe", name: "Box 3" });
const drill = anItem({ id: "drill", storageUnitId: "box3", name: "Cordless drill" });

const theHouse = (): void => {
  apiServer.use(
    http.get(`${API_URL}/auth/me`, () =>
      HttpResponse.json({ user: { id: "u1", username: "dario" } }),
    ),
    http.get(`${API_URL}/storage-units`, () =>
      HttpResponse.json({ tree: [aTree(garage, [aTree(wardrobe, [aTree(box)])])] }),
    ),
    http.get(`${API_URL}/storage-units/box3`, () =>
      HttpResponse.json({ unit: withPhoto(box), path: [garage, wardrobe, box], children: [], items: [drill] }),
    ),
    http.get(`${API_URL}/storage-units/wardrobe`, () =>
      HttpResponse.json({
        unit: withPhoto(wardrobe),
        path: [garage, wardrobe],
        children: [box],
        items: [],
      }),
    ),
    http.get(`${API_URL}/storage-units/garage`, () =>
      HttpResponse.json({ unit: withPhoto(garage), path: [garage], children: [wardrobe], items: [] }),
    ),
  );
};

const refusedBecauseNotEmpty = () =>
  HttpResponse.json(
    {
      error: {
        code: "STORAGE_UNIT_NOT_EMPTY",
        message: "storage unit box3 still holds 1 item and 0 child units",
        details: { storageUnitId: "box3", itemCount: 1, childUnitCount: 0 },
      },
    },
    { status: 409 },
  );

/**
 * # Opening the box's own menu
 *
 * Everything that is not the point of this screen now lives behind one
 * control (ADR 21). The tests that used to press a button in a row of nine
 * open the menu first; what they do after that is unchanged, because what a
 * person can DO is unchanged — which is the entire claim this file makes
 * about the redesign.
 */
const openTheMenuFor = async (name: string): Promise<void> => {
  await userEvent.click(await screen.findByRole("button", { name: `More actions for ${name}` }));
};

/**
 * The panel that control opens, and the only honest place to ask what is
 * BEHIND the menu.
 *
 * Asking `screen` instead would find a control of the same name standing in
 * the row outside the panel and call the menu proved — which is exactly how
 * `units.addInside` went on passing a test about the overflow while it was
 * still a button on the screen.
 */
const theMenuFor = async (name: string): Promise<HTMLElement> =>
  await screen.findByRole("dialog", { name: `More actions for ${name}` });

/** The same control, for somebody reading the app in Spanish. */
const abreElMenuDe = async (name: string): Promise<void> => {
  await userEvent.click(await screen.findByRole("button", { name: `Más acciones para ${name}` }));
};

describe("looking after a storage unit", () => {
  beforeEach(() => {
    sessionStore.save(aSession());
    theHouse();
  });

  it("puts a new unit inside the one being looked at", async () => {
    const created: unknown[] = [];
    apiServer.use(
      http.post(`${API_URL}/storage-units`, async ({ request }) => {
        created.push(await request.json());

        return HttpResponse.json(
          { unit: withPhoto(aStorageUnit({ id: "new", parentId: "box3", name: "Little bag" })) },
          { status: 201 },
        );
      }),
    );

    renderApp({ route: "/units/box3" });

    await openTheMenuFor("Box 3");
    await userEvent.click(await screen.findByRole("button", { name: /add a space inside/i }));
    await userEvent.type(screen.getByRole("textbox", { name: /^name/i }), "Little bag");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: /kind/i }), "BAG");
    await userEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      expect(created).toEqual([
        { parentId: "box3", name: "Little bag", kind: "BAG", description: null },
      ]);
    });
  });

  it("puts the API's own complaint next to the field when the request is refused", async () => {
    apiServer.use(
      http.post(`${API_URL}/storage-units`, () =>
        HttpResponse.json(
          {
            error: {
              code: "VALIDATION_FAILED",
              message: "The request body or path is malformed",
              details: {
                issues: [{ path: "name", message: "Too big: expected string to have <=200 characters" }],
              },
            },
          },
          { status: 400 },
        ),
      ),
    );

    renderApp({ route: "/units/box3" });

    await openTheMenuFor("Box 3");
    await userEvent.click(await screen.findByRole("button", { name: /add a space inside/i }));
    await userEvent.type(screen.getByRole("textbox", { name: /^name/i }), "A name");
    await userEvent.click(screen.getByRole("button", { name: /^create$/i }));

    expect(await screen.findByText(/<=200 characters/i)).toBeVisible();
  });

  it("renames a box from its own screen", async () => {
    const edits: unknown[] = [];
    apiServer.use(
      http.patch(`${API_URL}/storage-units/box3`, async ({ request }) => {
        edits.push(await request.json());

        return HttpResponse.json({ unit: withPhoto({ ...box, name: "Box 4" }) });
      }),
    );

    renderApp({ route: "/units/box3" });

    await openTheMenuFor("Box 3");
    await userEvent.click(await screen.findByRole("button", { name: /^edit$/i }));
    await userEvent.clear(screen.getByRole("textbox", { name: /^name/i }));
    await userEvent.type(screen.getByRole("textbox", { name: /^name/i }), "Box 4");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(edits).toEqual([{ name: "Box 4", kind: "BOX", description: null }]);
    });
  });

  it("never sends a parent while editing: moving is its own thing", async () => {
    const edits: Record<string, unknown>[] = [];
    apiServer.use(
      http.patch(`${API_URL}/storage-units/box3`, async ({ request }) => {
        edits.push((await request.json()) as Record<string, unknown>);

        return HttpResponse.json({ unit: withPhoto(box) });
      }),
    );

    renderApp({ route: "/units/box3" });

    await openTheMenuFor("Box 3");
    await userEvent.click(await screen.findByRole("button", { name: /^edit$/i }));
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(edits).toHaveLength(1);
    });
    // ADR 2 guards moving, and the API refuses a parentId on this route. The
    // client must not be the one that finds that out.
    expect(edits[0]).not.toHaveProperty("parentId");
  });

  it("opens the edit form already holding what the box says", async () => {
    apiServer.use(
      http.get(`${API_URL}/storage-units/box3`, () =>
        HttpResponse.json({
          unit: withPhoto({ ...box, description: "Cables, mostly" }),
          path: [garage, wardrobe, box],
          children: [],
          items: [drill],
        }),
      ),
    );

    renderApp({ route: "/units/box3" });

    await openTheMenuFor("Box 3");
    await userEvent.click(await screen.findByRole("button", { name: /^edit$/i }));

    expect(screen.getByRole("textbox", { name: /^name/i })).toHaveValue("Box 3");
    expect(screen.getByRole("textbox", { name: /description/i })).toHaveValue(
      "Cables, mostly",
    );
  });

  it("puts the API's complaint about a new name next to the field", async () => {
    apiServer.use(
      http.patch(`${API_URL}/storage-units/box3`, () =>
        HttpResponse.json(
          {
            error: {
              code: "VALIDATION_FAILED",
              message: "The request body or path is malformed",
              details: {
                issues: [
                  { path: "name", message: "Too big: expected string to have <=200 characters" },
                ],
              },
            },
          },
          { status: 400 },
        ),
      ),
    );

    renderApp({ route: "/units/box3" });

    await openTheMenuFor("Box 3");
    await userEvent.click(await screen.findByRole("button", { name: /^edit$/i }));
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(await screen.findByText(/<=200 characters/i)).toBeVisible();
  });

  it("does not throw away a box that still has things in it, and offers to empty it", async () => {
    const calls: string[] = [];
    let emptied = false;
    apiServer.use(
      http.delete(`${API_URL}/storage-units/box3`, () => {
        calls.push("delete");

        return emptied ? new HttpResponse(null, { status: 204 }) : refusedBecauseNotEmpty();
      }),
      http.post(`${API_URL}/storage-units/box3/empty`, async ({ request }) => {
        calls.push(`empty ${JSON.stringify(await request.json())}`);
        emptied = true;

        return HttpResponse.json({ movedItems: [drill], movedChildUnits: [] });
      }),
    );

    renderApp({ route: "/units/box3" });

    await openTheMenuFor("Box 3");
    await userEvent.click(await screen.findByRole("button", { name: /^delete$/i }));
    await userEvent.click(await screen.findByRole("button", { name: /delete this unit/i }));

    // The refusal is about the WORLD, so it comes with a way to change it.
    expect(await screen.findByText(/still holds 1 item/i)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: /empty it into metal wardrobe/i }));

    await waitFor(() => {
      expect(calls).toEqual(["delete", "empty {}", "delete"]);
    });
    expect(
      await screen.findByRole("heading", { name: "Metal wardrobe" }),
    ).toBeVisible();
  });

  it("asks where the contents should go when the unit has no parent to empty into", async () => {
    const root = aStorageUnit({ id: "shed", name: "Shed", kind: "ROOM" });
    apiServer.use(
      http.get(`${API_URL}/storage-units/shed`, () =>
        HttpResponse.json({ unit: withPhoto(root), path: [root], children: [], items: [drill] }),
      ),
      http.post(`${API_URL}/storage-units/shed/empty`, async ({ request }) =>
        HttpResponse.json({
          movedItems: [drill],
          movedChildUnits: [],
          echo: await request.json(),
        }),
      ),
    );

    renderApp({ route: "/units/shed" });

    await openTheMenuFor("Shed");
    await userEvent.click(await screen.findByRole("button", { name: /^empty$/i }));

    expect(
      await screen.findByText(/a root unit has no parent to empty into/i),
    ).toBeVisible();
    expect(screen.getByRole("combobox", { name: /move everything into/i })).toBeVisible();
  });

  it("explains a move the tree cannot take, in the words of the tree", async () => {
    apiServer.use(
      http.post(`${API_URL}/storage-units/wardrobe/move`, () =>
        HttpResponse.json(
          {
            error: {
              code: "CYCLIC_STORAGE_UNIT_MOVE",
              message: "storage unit wardrobe cannot be moved into its own subtree",
              details: { storageUnitId: "wardrobe", targetParentId: "box3" },
            },
          },
          { status: 409 },
        ),
      ),
    );

    renderApp({ route: "/units/wardrobe" });

    await openTheMenuFor("Metal wardrobe");
    await userEvent.click(await screen.findByRole("button", { name: /^move$/i }));
    await userEvent.selectOptions(
      await screen.findByRole("combobox", { name: /move it into/i }),
      "box3",
    );
    await userEvent.click(screen.getByRole("button", { name: /move it/i }));

    expect(await screen.findByText(/inside itself/i)).toBeVisible();
  });

  it("moves a unit somewhere else in the house", async () => {
    const moves: unknown[] = [];
    apiServer.use(
      http.post(`${API_URL}/storage-units/box3/move`, async ({ request }) => {
        moves.push(await request.json());

        return HttpResponse.json({ unit: withPhoto({ ...box, parentId: garage.id }) });
      }),
    );

    renderApp({ route: "/units/box3" });

    await openTheMenuFor("Box 3");
    await userEvent.click(await screen.findByRole("button", { name: /^move$/i }));
    await userEvent.selectOptions(
      await screen.findByRole("combobox", { name: /move it into/i }),
      "garage",
    );
    await userEvent.click(screen.getByRole("button", { name: /move it/i }));

    await waitFor(() => {
      expect(moves).toEqual([{ parentId: "garage" }]);
    });
  });

  /**
   * # A screen that has decided what it is for
   *
   * This box used to offer nine controls of the same size and weight, and in
   * Spanish every one of their labels is wider than the 8rem the row was laid
   * out around — so they stacked, and the screen became a column of identical
   * blocks a person had to READ from the top to use.
   *
   * The rule (ADR 21) is one primary action and at most one secondary. On a
   * box the primary is putting something in it. Everything else is behind the
   * menu, and this is what says so: not a class name, but the fact that a
   * person looking at the screen cannot press any of them yet.
   */
  it("shows only what a box is FOR, until it is asked for more", async () => {
    renderApp({ route: "/units/box3" });

    expect(await screen.findByRole("button", { name: /add an item/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /search inside/i })).toBeVisible();

    for (const gone of [
      /^edit$/i,
      /^move$/i,
      /^empty$/i,
      /^delete$/i,
      /add a space inside/i,
    ]) {
      expect(screen.queryByRole("button", { name: gone })).toBeNull();
    }

    for (const gone of [/show the label/i, /label sheet/i]) {
      expect(screen.queryByRole("link", { name: gone })).toBeNull();
    }
  });

  /**
   * # The two things somebody does standing in front of a box
   *
   * The owner, after a week with it on his phone: "dentro de un espacio,
   * quiero que las acciones principales sean buscar y añadir un objeto".
   *
   * He is right, and the reason is the box itself. Somebody who has walked to
   * a shelf and opened its screen is either putting something in it or looking
   * for something in it. Growing a drawer inside it is a thing you do once,
   * when the shelf is new — so it moved into the menu and searching took its
   * place, which is a swap and not an addition: still one primary and one
   * secondary (ADR 21).
   */
  it("goes from a box straight to searching inside that box", async () => {
    renderApp({ route: "/units/box3" });

    await userEvent.click(await screen.findByRole("link", { name: /search inside/i }));

    expect(
      await screen.findByText("Searching inside Box 3, and everything under it."),
    ).toBeVisible();
    expect(screen.getByRole("searchbox", { name: /search for a thing or a box/i })).toBeVisible();
  });

  /** And the one it displaced is still there, one press further in. */
  it("still grows a space inside a box, from behind the overflow", async () => {
    renderApp({ route: "/units/box3" });

    await openTheMenuFor("Box 3");

    expect(
      within(await theMenuFor("Box 3")).getByRole("button", { name: /add a space inside/i }),
    ).toBeVisible();
  });

  /**
   * Hiding seven things is only an improvement if all seven are still there.
   * This is the test that would fail if somebody "tidied" one away while
   * moving them, which is the failure a redesign invites.
   */
  it("still offers every one of them, all behind the one control", async () => {
    renderApp({ route: "/units/box3" });

    await openTheMenuFor("Box 3");
    const menu = within(await theMenuFor("Box 3"));

    for (const name of [
      /add a space inside/i,
      /^edit$/i,
      /^move$/i,
      /^empty$/i,
      /^delete$/i,
    ]) {
      expect(menu.getByRole("button", { name })).toBeVisible();
    }

    expect(menu.getByRole("link", { name: /show the label/i })).toBeVisible();

    /*
      And NOT a sheet of every label in the house. The owner: "tampoco tiene
      sentido que en las acciones de un espacio puedas ver todas las etiquetas,
      con ver la del propio espacio es suficiente". Printing a sheet is a job
      you do for the whole house, from the screen that shows the whole house.
    */
    expect(menu.queryByRole("link", { name: /label sheet/i })).toBeNull();
  });

  /**
   * The whole point of a redesign is that nothing a person could do before has
   * become impossible. So this drives the longest path there is — open the
   * menu, delete the box, watch the screen go back to where the box was — and
   * asserts the request that left the browser.
   */
  it("can still delete a box, from behind the overflow", async () => {
    const deleted: string[] = [];
    apiServer.use(
      http.get(`${API_URL}/storage-units/box3`, () =>
        HttpResponse.json({
          unit: withPhoto(box),
          path: [garage, wardrobe, box],
          children: [],
          items: [],
        }),
      ),
      http.delete(`${API_URL}/storage-units/box3`, () => {
        deleted.push("box3");

        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderApp({ route: "/units/box3" });

    await openTheMenuFor("Box 3");
    await userEvent.click(await screen.findByRole("button", { name: /^delete$/i }));
    await userEvent.click(await screen.findByRole("button", { name: /delete this unit/i }));

    await waitFor(() => {
      expect(deleted).toEqual(["box3"]);
    });
    // And it does not leave you standing on the screen of a box that is gone.
    expect(await screen.findByRole("heading", { name: "Metal wardrobe" })).toBeVisible();
  });

  it("starts a new root from the inventory screen", async () => {
    const created: unknown[] = [];
    apiServer.use(
      http.post(`${API_URL}/storage-units`, async ({ request }) => {
        created.push(await request.json());

        return HttpResponse.json(
          { unit: withPhoto(aStorageUnit({ id: "shed", name: "Shed", kind: "ROOM" })) },
          { status: 201 },
        );
      }),
    );

    renderApp({ route: "/" });

    await userEvent.click(await screen.findByRole("button", { name: /add a space/i }));
    await userEvent.type(screen.getByRole("textbox", { name: /^name/i }), "Shed");
    await userEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      expect(created).toEqual([
        { parentId: null, name: "Shed", kind: "ROOM", description: null },
      ]);
    });
  });
});

/**
 * # The same screens, in Spanish
 *
 * The rest of this file drives the app in English and asserts the words a
 * person reads. These do the same in Spanish rather than asserting keys,
 * deliberately: `getByText(t("units.notEmpty"))` would pass against a key
 * wired to the wrong sentence, and proves only that the test and the screen
 * agree on a name nobody reads.
 */
describe("looking after a storage unit, in Spanish", () => {
  beforeEach(() => {
    sessionStore.save(aSession());
    languageStore.save("es");
    theHouse();
  });

  /**
   * The sentence the whole translation layer was designed around: two counts
   * in one refusal, each agreeing with its own noun, joined by a word that is
   * not "and" — and the numbers still the API's own.
   */
  it("counts what is still in the box, agreeing with each noun", async () => {
    apiServer.use(
      http.delete(`${API_URL}/storage-units/box3`, () =>
        HttpResponse.json(
          {
            error: {
              code: "STORAGE_UNIT_NOT_EMPTY",
              message: "storage unit box3 is not empty",
              details: { storageUnitId: "box3", itemCount: 2, childUnitCount: 1 },
            },
          },
          { status: 409 },
        ),
      ),
    );

    renderApp({ route: "/units/box3" });

    await abreElMenuDe("Box 3");
    await userEvent.click(await screen.findByRole("button", { name: /^borrar$/i }));
    await userEvent.click(await screen.findByRole("button", { name: /borrar esta unidad/i }));

    expect(
      await screen.findByText(
        "Box 3 todavía contiene 2 cosas y 1 unidad. No se borra una caja que sigue llena.",
      ),
    ).toBeVisible();
  });

  it("says one of each in the singular", async () => {
    apiServer.use(
      http.delete(`${API_URL}/storage-units/box3`, () =>
        HttpResponse.json(
          {
            error: {
              code: "STORAGE_UNIT_NOT_EMPTY",
              message: "storage unit box3 is not empty",
              details: { storageUnitId: "box3", itemCount: 1, childUnitCount: 1 },
            },
          },
          { status: 409 },
        ),
      ),
    );

    renderApp({ route: "/units/box3" });

    await abreElMenuDe("Box 3");
    await userEvent.click(await screen.findByRole("button", { name: /^borrar$/i }));
    await userEvent.click(await screen.findByRole("button", { name: /borrar esta unidad/i }));

    expect(await screen.findByText(/contiene 1 cosa y 1 unidad/)).toBeVisible();
  });

  /** A kind is a word a person reads, while `BOX` is what the machines agree on. */
  it("says what kind of thing a unit is, in Spanish", async () => {
    renderApp({ route: "/units/wardrobe" });

    expect(await screen.findByRole("heading", { name: "Metal wardrobe" })).toBeVisible();
    expect(screen.getByText("Mueble")).toBeVisible();
  });

  /** Only a screen reader ever hears these, which is exactly why they matter. */
  it("names the lists a screen reader reads out", async () => {
    renderApp({ route: "/units/wardrobe" });

    expect(await screen.findByRole("list", { name: "Unidades dentro" })).toBeVisible();
  });

  it("offers the way out of a full box in Spanish, naming where things will go", async () => {
    apiServer.use(http.delete(`${API_URL}/storage-units/box3`, refusedBecauseNotEmpty));

    renderApp({ route: "/units/box3" });

    await abreElMenuDe("Box 3");
    await userEvent.click(await screen.findByRole("button", { name: /^borrar$/i }));
    await userEvent.click(await screen.findByRole("button", { name: /borrar esta unidad/i }));

    expect(
      await screen.findByRole("button", { name: "Vaciarla en Metal wardrobe y borrarla" }),
    ).toBeVisible();
  });
});
