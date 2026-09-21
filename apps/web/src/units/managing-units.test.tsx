import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { sessionStore } from "../auth/session-store.js";
import { apiServer, API_URL } from "../testing/api-server.js";
import { anItem, aSession, aStorageUnit, aTree, withPhoto } from "@ariadna/api-client/testing";
import { renderApp, screen, userEvent, waitFor } from "../testing/render-app.js";

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

    await userEvent.click(await screen.findByRole("button", { name: /add a unit inside/i }));
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

    await userEvent.click(await screen.findByRole("button", { name: /add a unit inside/i }));
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

    await userEvent.click(await screen.findByRole("button", { name: /add a room/i }));
    await userEvent.type(screen.getByRole("textbox", { name: /^name/i }), "Shed");
    await userEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      expect(created).toEqual([
        { parentId: null, name: "Shed", kind: "ROOM", description: null },
      ]);
    });
  });
});
