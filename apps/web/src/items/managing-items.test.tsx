import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { sessionStore } from "../auth/session-store.js";
import { apiServer, API_URL } from "../testing/api-server.js";
import { anItem, aSession, aStorageUnit, aTree } from "../testing/fixtures.js";
import { renderApp, screen, userEvent, waitFor, within } from "../testing/render-app.js";

const garage = aStorageUnit({ id: "garage", name: "Garage", kind: "ROOM" });
const box = aStorageUnit({ id: "box3", parentId: "garage", name: "Box 3" });
const drill = anItem({ id: "drill", storageUnitId: "box3", name: "Cordless drill" });
const hdmi = anItem({ id: "hdmi", storageUnitId: "box3", name: "HDMI 2.1" });

const theHouse = (): void => {
  apiServer.use(
    http.get(`${API_URL}/auth/me`, () =>
      HttpResponse.json({ user: { id: "u1", username: "dario" } }),
    ),
    http.get(`${API_URL}/storage-units`, () =>
      HttpResponse.json({ tree: [aTree(garage, [aTree(box)])] }),
    ),
    http.get(`${API_URL}/storage-units/garage`, () =>
      HttpResponse.json({ unit: garage, path: [garage], children: [box], items: [] }),
    ),
    http.get(`${API_URL}/storage-units/box3`, () =>
      HttpResponse.json({
        unit: box,
        path: [garage, box],
        children: [],
        items: [drill, hdmi],
      }),
    ),
    http.get(`${API_URL}/items/drill`, () =>
      HttpResponse.json({ item: drill, storageUnit: box, path: [garage, box] }),
    ),
  );
};

describe("looking after items", () => {
  beforeEach(() => {
    sessionStore.save(aSession());
    theHouse();
  });

  it("puts a new item in the box being looked at", async () => {
    const created: unknown[] = [];
    apiServer.use(
      http.post(`${API_URL}/items`, async ({ request }) => {
        created.push(await request.json());

        return HttpResponse.json({ item: anItem({ id: "new", name: "Tape" }) }, { status: 201 });
      }),
    );

    renderApp({ route: "/units/box3" });

    await userEvent.click(await screen.findByRole("button", { name: /add an item/i }));
    await userEvent.type(screen.getByRole("textbox", { name: /^name/i }), "Masking tape");
    await userEvent.clear(screen.getByRole("spinbutton", { name: /quantity/i }));
    await userEvent.type(screen.getByRole("spinbutton", { name: /quantity/i }), "3");
    await userEvent.type(screen.getByRole("textbox", { name: /tags/i }), "diy, tape");
    await userEvent.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => {
      expect(created).toEqual([
        {
          storageUnitId: "box3",
          name: "Masking tape",
          description: null,
          quantity: 3,
          tags: ["diy", "tape"],
        },
      ]);
    });
  });

  it("passes on the domain's own refusal of a quantity", async () => {
    apiServer.use(
      http.post(`${API_URL}/items`, () =>
        HttpResponse.json(
          {
            error: {
              code: "INVALID_QUANTITY",
              message: "quantity must be an integer of at least 1",
              details: { quantity: 0 },
            },
          },
          { status: 422 },
        ),
      ),
    );

    renderApp({ route: "/units/box3" });

    await userEvent.click(await screen.findByRole("button", { name: /add an item/i }));
    await userEvent.type(screen.getByRole("textbox", { name: /^name/i }), "Nothing");
    await userEvent.clear(screen.getByRole("spinbutton", { name: /quantity/i }));
    await userEvent.type(screen.getByRole("spinbutton", { name: /quantity/i }), "0");
    await userEvent.click(screen.getByRole("button", { name: /^add$/i }));

    expect(await screen.findByText(/integer of at least 1/i)).toBeVisible();
  });

  it("moves several items in one go, because emptying a box one item at a time is a chore", async () => {
    const moves: unknown[] = [];
    apiServer.use(
      http.post(`${API_URL}/items/move`, async ({ request }) => {
        moves.push(await request.json());

        return HttpResponse.json({ items: [drill, hdmi] });
      }),
    );

    renderApp({ route: "/units/box3" });

    await userEvent.click(
      await screen.findByRole("checkbox", { name: /select cordless drill/i }),
    );
    await userEvent.click(screen.getByRole("checkbox", { name: /select HDMI 2\.1/i }));
    await userEvent.click(screen.getByRole("button", { name: /move 2 items/i }));
    await userEvent.selectOptions(
      await screen.findByRole("combobox", { name: /move them into/i }),
      "garage",
    );
    await userEvent.click(screen.getByRole("button", { name: /^move them$/i }));

    await waitFor(() => {
      expect(moves).toEqual([{ itemIds: ["drill", "hdmi"], targetUnitId: "garage" }]);
    });
  });

  it("says the whole batch was refused when one id in it is unknown", async () => {
    apiServer.use(
      http.post(`${API_URL}/items/move`, () =>
        HttpResponse.json(
          {
            error: {
              code: "ITEM_NOT_FOUND",
              message: "item hdmi was not found",
              details: { itemId: "hdmi" },
            },
          },
          { status: 422 },
        ),
      ),
    );

    renderApp({ route: "/units/box3" });

    await userEvent.click(
      await screen.findByRole("checkbox", { name: /select cordless drill/i }),
    );
    await userEvent.click(screen.getByRole("button", { name: /move 1 item/i }));
    await userEvent.selectOptions(
      await screen.findByRole("combobox", { name: /move them into/i }),
      "garage",
    );
    await userEvent.click(screen.getByRole("button", { name: /^move them$/i }));

    expect(await screen.findByText(/nothing was moved/i)).toBeVisible();
  });

  it("moves one item from its own screen", async () => {
    const moves: unknown[] = [];
    apiServer.use(
      http.post(`${API_URL}/items/move`, async ({ request }) => {
        moves.push(await request.json());

        return HttpResponse.json({ items: [drill] });
      }),
    );

    renderApp({ route: "/items/drill" });

    await userEvent.click(await screen.findByRole("button", { name: /^move$/i }));
    await userEvent.selectOptions(
      await screen.findByRole("combobox", { name: /move it into/i }),
      "garage",
    );
    await userEvent.click(screen.getByRole("button", { name: /move it/i }));

    await waitFor(() => {
      expect(moves).toEqual([{ itemIds: ["drill"], targetUnitId: "garage" }]);
    });
  });

  it("renames and retags an item from its own screen", async () => {
    const edits: unknown[] = [];
    apiServer.use(
      http.patch(`${API_URL}/items/drill`, async ({ request }) => {
        edits.push(await request.json());

        return HttpResponse.json({ item: { ...drill, name: "Cordless drill 18V" } });
      }),
    );

    renderApp({ route: "/items/drill" });

    await userEvent.click(await screen.findByRole("button", { name: /^edit$/i }));
    await userEvent.clear(screen.getByRole("textbox", { name: /^name/i }));
    await userEvent.type(
      screen.getByRole("textbox", { name: /^name/i }),
      "Cordless drill 18V",
    );
    await userEvent.type(screen.getByRole("textbox", { name: /tags/i }), "tools, 18v");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(edits).toEqual([
        {
          name: "Cordless drill 18V",
          description: null,
          quantity: 1,
          tags: ["tools", "18v"],
        },
      ]);
    });
  });

  it("never sends a storage unit while editing: moving is its own thing", async () => {
    const edits: Record<string, unknown>[] = [];
    apiServer.use(
      http.patch(`${API_URL}/items/drill`, async ({ request }) => {
        edits.push((await request.json()) as Record<string, unknown>);

        return HttpResponse.json({ item: drill });
      }),
    );

    renderApp({ route: "/items/drill" });

    await userEvent.click(await screen.findByRole("button", { name: /^edit$/i }));
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(edits).toHaveLength(1);
    });
    expect(edits[0]).not.toHaveProperty("storageUnitId");
  });

  it("opens the edit form already holding what the item says", async () => {
    apiServer.use(
      http.get(`${API_URL}/items/drill`, () =>
        HttpResponse.json({
          item: { ...drill, quantity: 4, tags: ["tools", "18v"] },
          storageUnit: box,
          path: [garage, box],
        }),
      ),
    );

    renderApp({ route: "/items/drill" });

    await userEvent.click(await screen.findByRole("button", { name: /^edit$/i }));

    expect(screen.getByRole("textbox", { name: /^name/i })).toHaveValue("Cordless drill");
    expect(screen.getByRole("spinbutton", { name: /quantity/i })).toHaveValue(4);
    expect(screen.getByRole("textbox", { name: /tags/i })).toHaveValue("tools, 18v");
  });

  it("passes on the domain's refusal of a quantity while editing", async () => {
    apiServer.use(
      http.patch(`${API_URL}/items/drill`, () =>
        HttpResponse.json(
          {
            error: {
              code: "INVALID_QUANTITY",
              message: "quantity must be an integer of at least 1",
              details: { quantity: 0 },
            },
          },
          { status: 422 },
        ),
      ),
    );

    renderApp({ route: "/items/drill" });

    await userEvent.click(await screen.findByRole("button", { name: /^edit$/i }));
    await userEvent.clear(screen.getByRole("spinbutton", { name: /quantity/i }));
    await userEvent.type(screen.getByRole("spinbutton", { name: /quantity/i }), "0");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    // 422 is about the REQUEST, so it reads as something to fix here.
    const complaint = await screen.findByText(/integer of at least 1/i);
    expect(complaint).toBeVisible();
    expect(complaint.closest(".callout")).toHaveClass("callout--wrong");
  });

  it("deletes an item and goes back to the box it was in", async () => {
    let deleted = false;
    apiServer.use(
      http.delete(`${API_URL}/items/drill`, () => {
        deleted = true;

        return HttpResponse.json({ releasedPhotoIds: [] });
      }),
    );

    renderApp({ route: "/items/drill" });

    await userEvent.click(await screen.findByRole("button", { name: /^delete$/i }));
    await userEvent.click(await screen.findByRole("button", { name: /delete this item/i }));

    await waitFor(() => {
      expect(deleted).toBe(true);
    });
    expect(await screen.findByRole("heading", { name: "Box 3" })).toBeVisible();
  });

  it("lists every item in the house, each with where it is", async () => {
    apiServer.use(
      http.get(`${API_URL}/items`, () =>
        HttpResponse.json({
          items: [
            { item: drill, path: [garage, box], location: "Garage > Box 3" },
            { item: hdmi, path: [garage, box], location: "Garage > Box 3" },
          ],
        }),
      ),
    );

    renderApp({ route: "/items" });

    const list = await screen.findByRole("list", { name: /every item/i });
    const drillRow = within(list).getByRole("link", { name: /cordless drill/i });
    expect(drillRow).toBeVisible();
    expect(within(list).getAllByText("Garage > Box 3").length).toBeGreaterThan(0);
  });

  it("asks once for everything you own, not once per box", async () => {
    const asked: string[] = [];
    apiServer.use(
      http.get(`${API_URL}/items`, ({ request }) => {
        asked.push(new URL(request.url).pathname);

        return HttpResponse.json({
          items: [{ item: drill, path: [garage, box], location: "Garage > Box 3" }],
        });
      }),
    );

    renderApp({ route: "/items" });

    await screen.findByRole("list", { name: /every item/i });
    // The screen used to be assembled from one request per unit. It is one
    // request now, and the tree is not even needed to draw it.
    expect(asked).toEqual(["/items"]);
  });

  it("offers a way to try again when everything you own cannot be loaded", async () => {
    apiServer.use(
      http.get(`${API_URL}/items`, () => HttpResponse.error()),
    );

    renderApp({ route: "/items" });

    expect(
      await screen.findByRole("button", { name: /try again/i }, { timeout: 3000 }),
    ).toBeVisible();
  });
});
