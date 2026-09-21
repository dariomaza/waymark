import { aSession, aStorageUnit, withPhoto } from "@ariadna/api-client/testing";

import { API_URL, apiServer, http, HttpResponse } from "../testing/api-server.js";
import { fireEvent, renderApp, screen, waitFor } from "../testing/render-app.js";
import { theApiKnowsTheHouse } from "../testing/the-house.js";

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

describe("looking after a storage unit", () => {
  beforeEach(() => {
    theApiKnowsTheHouse();
  });

  it("shows where a box is, what is in it, and what is inside it", async () => {
    await renderApp({ session: aSession(), screen: atBox3 });

    expect(await screen.findByRole("header", { name: "Box 3" })).toBeOnTheScreen();
    // The breadcrumb is tappable, one step at a time.
    expect(screen.getByRole("link", { name: "Open Garage" })).toBeOnTheScreen();
    expect(screen.getByRole("link", { name: "Open Metal wardrobe" })).toBeOnTheScreen();
    expect(screen.getByText("Cordless drill")).toBeOnTheScreen();
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

    await fireEvent.press(await screen.findByRole("button", { name: "Add a unit inside" }));
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

    await fireEvent.press(await screen.findByRole("button", { name: "Add a unit inside" }));
    await fireEvent.changeText(screen.getByLabelText("Name"), "A name");
    await fireEvent.press(screen.getByRole("button", { name: "Create" }));

    expect(await screen.findByText(/<=200 characters/i)).toBeOnTheScreen();
  });

  it("says the app could not reach Ariadna, rather than that the box is gone", async () => {
    apiServer.use(
      http.get(`${API_URL}/storage-units/box3`, () => HttpResponse.error()),
    );

    await renderApp({ session: aSession(), screen: atBox3 });

    expect(await screen.findByText(/could not reach ariadna/i)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Try again" })).toBeOnTheScreen();
  });
});
