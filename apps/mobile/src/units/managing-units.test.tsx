import { anItem, aSession, aStorageUnit, withPhoto } from "@waymark/api-client/testing";

import { API_URL, apiServer, http, HttpResponse } from "../testing/api-server.js";
import { fireEvent, renderApp, screen, waitFor } from "../testing/render-app.js";
import { box, garage, theApiKnowsTheHouse, wardrobe } from "../testing/the-house.js";

const atBox3 = { name: "Unit", params: { id: "box3" } } as const;

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

const refusedBecauseCyclic = () =>
  HttpResponse.json(
    {
      error: {
        code: "CYCLIC_STORAGE_UNIT_MOVE",
        message: "storage unit wardrobe cannot be moved into its own subtree",
        details: { storageUnitId: "wardrobe", targetParentId: "box3" },
      },
    },
    { status: 409 },
  );

/**
 * # Opening the box's own menu
 *
 * Everything that is not the point of this screen now lives behind one control
 * beside the box's name (ADR 21). The tests that used to press a button in a
 * column of six open the menu first; what they do after that is unchanged,
 * which is the whole claim this file makes about the redesign.
 */
const openTheMenuFor = async (name: string): Promise<void> => {
  await fireEvent.press(await screen.findByRole("button", { name: `More actions for ${name}` }));
};

/** The same control, for somebody reading the app in Spanish. */
const abreElMenuDe = async (name: string): Promise<void> => {
  await fireEvent.press(await screen.findByRole("button", { name: `Más acciones para ${name}` }));
};

describe("looking after a storage unit", () => {
  beforeEach(() => {
    theApiKnowsTheHouse();
  });

  /**
   * # A screen that has decided what it is for
   *
   * This box used to offer six controls stacked down the phone, every one of
   * them the same size and the same weight — a wall a thumb has to READ to
   * use. The rule (ADR 21) is one primary action and at most one secondary;
   * on a box the primary is putting something in it.
   *
   * What is asserted is not a colour but what a person can reach: none of the
   * six is pressable until the menu is opened.
   */
  it("shows only what a box is FOR, until it is asked for more", async () => {
    await renderApp({ session: aSession(), screen: atBox3 });

    expect(await screen.findByRole("button", { name: "Add an item" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Search inside" })).toBeOnTheScreen();

    for (const gone of [
      "Add a space inside",
      "Edit",
      "Move",
      "Empty",
      "Delete",
      "Show the label",
      "Select several",
    ]) {
      expect(screen.queryByRole("button", { name: gone })).toBeNull();
    }
  });

  /**
   * # The two things somebody does standing in front of a box
   *
   * The owner said it about the browser — "dentro de un espacio, quiero que
   * las acciones principales sean buscar y añadir un objeto" — and it is a
   * statement about the box rather than about a client, so the phone answers
   * it too.
   *
   * It answers it by GAINING something. The browser had a scoped search behind
   * its menu and this app had none at all: the `within` parameter the search
   * tab already reads was reachable from nowhere on the phone. So the two
   * clients now offer the same pair, which is the agreement that matters —
   * one of them does it with a URL and the other with a navigation, and that
   * difference is each platform's own business.
   */
  it("goes from a box straight to searching inside that box", async () => {
    await renderApp({ session: aSession(), screen: atBox3 });

    await fireEvent.press(await screen.findByRole("button", { name: "Search inside" }));

    expect(
      await screen.findByText("Searching inside Box 3, and everything under it."),
    ).toBeOnTheScreen();
  });

  /**
   * Hiding six things is only an improvement if all six are still there. This
   * is the test that fails if somebody tidies one away while moving them,
   * which is the failure a redesign invites.
   */
  it("still offers every one of them, all behind the one control", async () => {
    await renderApp({ session: aSession(), screen: atBox3 });

    await openTheMenuFor("Box 3");

    for (const name of [
      "Select several",
      "Add a space inside",
      "Show the label",
      "Edit",
      "Move",
      "Empty",
      "Delete",
    ]) {
      expect(await screen.findByRole("button", { name })).toBeOnTheScreen();
    }
  });

  it("shows where a box is, what is in it, and what is inside it", async () => {
    await renderApp({ session: aSession(), screen: atBox3 });

    expect(await screen.findByRole("header", { name: "Box 3" })).toBeOnTheScreen();
    // The breadcrumb is tappable, one step at a time.
    expect(screen.getByRole("link", { name: "Open Garage" })).toBeOnTheScreen();
    expect(screen.getByRole("link", { name: "Open Metal wardrobe" })).toBeOnTheScreen();
    expect(screen.getByText("Cordless drill")).toBeOnTheScreen();
  });

  /**
   * The contents are a grid of cards: a thing is recognised by its picture,
   * and its one spare line is the TAGS — inside a unit the location would be
   * the same string on every card, which is noise rather than an answer.
   */
  it("shows what is in a box as cards, tagged rather than located", async () => {
    apiServer.use(
      http.get(`${API_URL}/storage-units/box3`, () =>
        HttpResponse.json({
          unit: withPhoto(box),
          path: [garage, wardrobe, box],
          children: [],
          items: [
            anItem({
              id: "drill",
              storageUnitId: "box3",
              name: "Cordless drill",
              tags: ["tools", "power"],
            }),
          ],
        }),
      ),
    );

    await renderApp({ session: aSession(), screen: atBox3 });

    expect(
      await screen.findByRole("link", { name: "Cordless drill, tools, power" }),
    ).toBeOnTheScreen();
    expect(screen.getByText("tools, power")).toBeOnTheScreen();
  });

  /**
   * Units inside stay a LIST. A box is not recognised by a photograph of a
   * box, so a grid of squares would cost the same height to say less; the
   * icon is there because a row of names alone does not say which of the two
   * kinds of thing on this screen you are looking at.
   */
  it("keeps the units inside as a list under their own heading", async () => {
    await renderApp({
      session: aSession(),
      screen: { name: "Unit", params: { id: "garage" } },
    });

    expect(await screen.findByRole("header", { name: "Units inside" })).toBeOnTheScreen();
    expect(screen.getByRole("link", { name: "Metal wardrobe, Furniture" })).toBeOnTheScreen();
  });

  it("renames a box from its own screen", async () => {
    const edits: unknown[] = [];
    apiServer.use(
      http.patch(`${API_URL}/storage-units/box3`, async ({ request }) => {
        edits.push(await request.json());

        return HttpResponse.json({ unit: withPhoto(aStorageUnit({ id: "box3", name: "Box 4" })) });
      }),
    );

    await renderApp({ session: aSession(), screen: atBox3 });

    await openTheMenuFor("Box 3");
    await fireEvent.press(await screen.findByRole("button", { name: "Edit" }));
    await fireEvent.changeText(screen.getByLabelText("Name"), "Box 4");
    await fireEvent.press(screen.getByRole("button", { name: "Save changes" }));

    // Every editable field goes, and no parent: the API refuses a `parentId`
    // on this route, and this form cannot even express one (ADR 14).
    await waitFor(() => {
      expect(edits).toEqual([{ name: "Box 4", kind: "BOX", description: null }]);
    });
  });

  /**
   * # The refusal that is a feature
   *
   * The domain will not throw away a full box (ADR 3), the API says so with a
   * 409 — a refusal about the WORLD (ADR 8) — and the one thing the person
   * wants next is to empty it and delete it. This app does not check
   * emptiness first: that check belongs to the API, it cannot be raced, and a
   * copy of it here would be a second copy of a rule that can drift.
   */
  it("offers to empty a box it was refused permission to delete", async () => {
    const calls: string[] = [];
    let emptied = false;
    apiServer.use(
      http.delete(`${API_URL}/storage-units/box3`, () => {
        calls.push("delete");

        return emptied ? HttpResponse.empty({ status: 204 }) : refusedBecauseNotEmpty();
      }),
      http.post(`${API_URL}/storage-units/box3/empty`, () => {
        calls.push("empty");
        emptied = true;

        return HttpResponse.json({ movedItems: [], movedChildUnits: [] });
      }),
    );

    await renderApp({ session: aSession(), screen: atBox3 });

    await openTheMenuFor("Box 3");
    await fireEvent.press(await screen.findByRole("button", { name: "Delete" }));
    await fireEvent.press(screen.getByRole("button", { name: "Delete this unit" }));

    // In the API's own numbers, not in a sentence this app invented.
    expect(
      await screen.findByText(/box 3 still holds 1 item/i),
    ).toBeOnTheScreen();

    // And the way out names where the contents will go.
    const offer = await screen.findByRole("button", {
      name: "Empty it into Metal wardrobe and delete",
    });
    await fireEvent.press(offer);

    await waitFor(() => {
      expect(calls).toEqual(["delete", "empty", "delete"]);
    });
  });

  /**
   * ADR 2 puts the subtree rule in the domain because a foreign key cannot
   * express it. The picker therefore offers every unit in the house,
   * INCLUDING the ones that would make a cycle: a client that hid them would
   * be a second, quieter copy of the invariant, and the copy that is wrong is
   * always the one in the client.
   */
  it("offers a move that would make a cycle, and reads out the refusal", async () => {
    apiServer.use(
      http.post(`${API_URL}/storage-units/wardrobe/move`, () => refusedBecauseCyclic()),
    );

    await renderApp({
      session: aSession(),
      screen: { name: "Unit", params: { id: "wardrobe" } },
    });

    await openTheMenuFor("Metal wardrobe");
    await fireEvent.press(await screen.findByRole("button", { name: "Move" }));

    // Box 3 is inside the wardrobe, and it is still on the list.
    const intoItsOwnBox = await screen.findByRole("radio", {
      name: "Garage > Metal wardrobe > Box 3",
    });
    await fireEvent.press(intoItsOwnBox);
    await fireEvent.press(screen.getByRole("button", { name: "Move it" }));

    expect(
      await screen.findByText(/cannot go inside itself, or inside anything already inside it/i),
    ).toBeOnTheScreen();
  });

  it("adds a unit inside the one being looked at", async () => {
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

    await renderApp({ session: aSession(), screen: atBox3 });

    await openTheMenuFor("Box 3");
    await fireEvent.press(await screen.findByRole("button", { name: "Add a space inside" }));
    await fireEvent.changeText(screen.getByLabelText("Name"), "Little bag");
    await fireEvent.press(screen.getByRole("radio", { name: "Bag" }));
    await fireEvent.press(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(created).toEqual([
        { parentId: "box3", name: "Little bag", kind: "BAG", description: null },
      ]);
    });
  });

  /**
   * A 400 from the request schema is the other half of ADR 8: fix the
   * REQUEST. It lands against the field the API named, in the API's own
   * words, because inventing a second copy of "names are at most 200
   * characters" here is how the two come to disagree.
   */
  it("puts the API's own complaint next to the field it names", async () => {
    apiServer.use(
      http.post(`${API_URL}/storage-units`, () =>
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

    await renderApp({ session: aSession(), screen: atBox3 });

    await openTheMenuFor("Box 3");
    await fireEvent.press(await screen.findByRole("button", { name: "Add a space inside" }));
    await fireEvent.changeText(screen.getByLabelText("Name"), "A name");
    await fireEvent.press(screen.getByRole("button", { name: "Create" }));

    expect(await screen.findByText(/<=200 characters/i)).toBeOnTheScreen();
  });

  it("says the app could not reach Waymark, rather than that the box is gone", async () => {
    apiServer.use(
      http.get(`${API_URL}/storage-units/box3`, () => HttpResponse.error()),
    );

    await renderApp({ session: aSession(), screen: atBox3 });

    expect(await screen.findByText(/could not reach waymark/i)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Try again" })).toBeOnTheScreen();
  });
});

/**
 * # The same screens, on a phone, in Spanish
 *
 * Asserted through the rendered Spanish rather than through keys. A test that
 * asks for `t("units.notEmpty")` proves the test and the screen agree on a
 * name nobody reads; it cannot catch a key wired to the wrong sentence, which
 * is the failure this layer actually makes possible.
 */
describe("looking after a storage unit, in Spanish", () => {
  beforeEach(() => {
    theApiKnowsTheHouse();
  });

  /**
   * Two counts in one refusal, each agreeing with its own noun, joined by a
   * word that is not "and" — and still in the API's own numbers.
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

    await renderApp({ session: aSession(), screen: atBox3, language: "es" });

    await abreElMenuDe("Box 3");
    await fireEvent.press(await screen.findByRole("button", { name: "Borrar" }));
    await fireEvent.press(screen.getByRole("button", { name: "Borrar esta unidad" }));

    expect(
      await screen.findByText(
        "Box 3 todavía contiene 2 cosas y 1 unidad. No se borra una caja que sigue llena.",
      ),
    ).toBeOnTheScreen();
  });

  it("says one of each in the singular", async () => {
    apiServer.use(http.delete(`${API_URL}/storage-units/box3`, refusedBecauseNotEmpty));

    await renderApp({ session: aSession(), screen: atBox3, language: "es" });

    await abreElMenuDe("Box 3");
    await fireEvent.press(await screen.findByRole("button", { name: "Borrar" }));
    await fireEvent.press(screen.getByRole("button", { name: "Borrar esta unidad" }));

    expect(await screen.findByText(/contiene 1 cosa\./)).toBeOnTheScreen();
  });

  /** The way out names where the contents will go, in Spanish. */
  it("offers to empty the box into its parent", async () => {
    apiServer.use(http.delete(`${API_URL}/storage-units/box3`, refusedBecauseNotEmpty));

    await renderApp({ session: aSession(), screen: atBox3, language: "es" });

    await abreElMenuDe("Box 3");
    await fireEvent.press(await screen.findByRole("button", { name: "Borrar" }));
    await fireEvent.press(screen.getByRole("button", { name: "Borrar esta unidad" }));

    expect(
      await screen.findByRole("button", { name: "Vaciarla en Metal wardrobe y borrarla" }),
    ).toBeOnTheScreen();
  });

  /** The rule is the domain's and the refusal is the API's; only the words change. */
  it("explains a move the tree cannot take", async () => {
    apiServer.use(
      http.post(`${API_URL}/storage-units/wardrobe/move`, () => refusedBecauseCyclic()),
    );

    await renderApp({
      session: aSession(),
      screen: { name: "Unit", params: { id: "wardrobe" } },
      language: "es",
    });

    await abreElMenuDe("Metal wardrobe");
    await fireEvent.press(await screen.findByRole("button", { name: "Mover" }));

    // The breadcrumb is made of names somebody typed, so it stays as typed.
    await fireEvent.press(
      await screen.findByRole("radio", { name: "Garage > Metal wardrobe > Box 3" }),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Moverla" }));

    expect(
      await screen.findByText(/no puede ir dentro de sí mismo/),
    ).toBeOnTheScreen();
  });
});

/**
 * # The one line that stops a kind being read as a rule
 *
 * `units.kindHint` — "A label, never a rule: anything can go inside anything."
 * — has been under the kind picker on the web since the picker existed, and
 * has never appeared on the phone, because `OptionList` had nowhere to put it.
 * The dictionary carried the sentence in two languages the whole time.
 *
 * It is not decoration. A picker offering Room, Furniture, Box and Container
 * looks exactly like a constraint on what may hold what, and somebody who
 * reads it that way stops putting a box inside a box — which the tree allows
 * and ADR 1 depends on.
 */
describe("choosing what kind of thing a unit is", () => {
  beforeEach(() => {
    theApiKnowsTheHouse();
  });

  it("says a kind is a label and never a rule, the way the browser does", async () => {
    await renderApp({ session: aSession(), screen: atBox3 });

    await openTheMenuFor("Box 3");
    await fireEvent.press(await screen.findByRole("button", { name: "Edit" }));

    expect(
      await screen.findByText("A label, never a rule: anything can go inside anything."),
    ).toBeOnTheScreen();
  });

  /** And a screen reader is told it too, rather than only the eye. */
  it("says it to a screen reader as well, since it explains the control", async () => {
    await renderApp({ session: aSession(), screen: atBox3 });

    await openTheMenuFor("Box 3");
    await fireEvent.press(await screen.findByRole("button", { name: "Edit" }));

    expect(await screen.findByLabelText("Kind")).toHaveProp(
      "accessibilityHint",
      "A label, never a rule: anything can go inside anything.",
    );
  });
});
