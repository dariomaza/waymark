import type { StorageUnitView } from "@waymark/api-client";
import { anItem, aStorageUnit, withPhoto } from "@waymark/api-client/testing";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { aMachineToken, aWaymark, API_URL, stubbedApi } from "../testing/api.js";
import type { Waymark } from "./answering.js";
import { moveItemsToUnit, type MoveItemsArguments } from "./move-items.js";

const apiServer = stubbedApi();

const GARAGE = aStorageUnit({ id: "garage", name: "Garage" });
const CRATE = aStorageUnit({ id: "crate", parentId: "garage", name: "Old crate" });
const OFFICE = aStorageUnit({ id: "office", name: "Office" });
const BOX = aStorageUnit({ id: "box-3", parentId: "garage", name: "Box 3" });

const at = (
  item: ReturnType<typeof anItem>,
  path: readonly StorageUnitView[],
): Record<string, unknown> => ({
  item,
  path,
  location: path.map((step) => step.name).join(" > "),
});

const INVENTORY = {
  items: [
    at(anItem({ id: "iron", name: "Soldering iron", storageUnitId: "crate" }), [
      GARAGE,
      CRATE,
    ]),
    at(anItem({ id: "hdmi", name: "Cable HDMI 2.1", storageUnitId: "office" }), [OFFICE]),
    at(anItem({ id: "already", name: "Spare fuses", storageUnitId: "box-3" }), [GARAGE, BOX]),
  ],
};

let moved: unknown[] = [];
let waymark: Waymark;

const withScope = (scope: "read" | "read-write"): void => {
  apiServer.use(http.get(`${API_URL}/auth/me`, () => HttpResponse.json(aMachineToken(scope))));
};

beforeEach(() => {
  moved = [];
  waymark = aWaymark();
  withScope("read-write");
  apiServer.use(
    http.get(`${API_URL}/items`, () => HttpResponse.json(INVENTORY)),
    http.get(`${API_URL}/storage-units/box-3`, () =>
      HttpResponse.json({ unit: withPhoto(BOX), path: [GARAGE, BOX], children: [], items: [] }),
    ),
    http.post(`${API_URL}/items/move`, async ({ request }) => {
      moved.push(await request.json());

      return HttpResponse.json({ items: [] });
    }),
  );
});

const MOVING: MoveItemsArguments = { itemIds: ["iron", "hdmi"], targetStorageUnitId: "box-3" };

const codeIn = (preview: string): string =>
  /confirmation: "([^"]+)"/u.exec(preview)?.[1] ?? "no code was offered";

describe("moving items, which does not happen on the first call", () => {
  it("moves nothing, and says what each thing is and where it is now", async () => {
    const preview = await moveItemsToUnit(waymark, MOVING);

    expect(moved).toEqual([]);
    expect(preview).toContain("Soldering iron");
    expect(preview).toContain("Garage > Old crate");
    expect(preview).toContain("Cable HDMI 2.1");
    expect(preview).toContain("Office");
    expect(preview).toContain("Garage > Box 3");
  });

  it("does it once the confirmation it issued comes back", async () => {
    const preview = await moveItemsToUnit(waymark, MOVING);

    const done = await moveItemsToUnit(waymark, {
      ...MOVING,
      confirmation: codeIn(preview),
    });

    expect(moved).toEqual([{ itemIds: ["iron", "hdmi"], targetUnitId: "box-3" }]);
    expect(done).toMatch(/moved/iu);
  });

  it.each(["yes", "true", "confirm", "go ahead"])(
    "refuses %o and moves nothing",
    async (guess) => {
      await moveItemsToUnit(waymark, MOVING);

      await expect(
        moveItemsToUnit(waymark, { ...MOVING, confirmation: guess }),
      ).rejects.toThrow();
      expect(moved).toEqual([]);
    },
  );

  it("refuses a confirmation issued for a different set of things", async () => {
    const preview = await moveItemsToUnit(waymark, MOVING);

    await expect(
      moveItemsToUnit(waymark, {
        itemIds: ["iron"],
        targetStorageUnitId: "box-3",
        confirmation: codeIn(preview),
      }),
    ).rejects.toThrow();
    expect(moved).toEqual([]);
  });

  it("accepts the same things named in another order, because that is the same move", async () => {
    const preview = await moveItemsToUnit(waymark, MOVING);

    await moveItemsToUnit(waymark, {
      itemIds: ["hdmi", "iron"],
      targetStorageUnitId: "box-3",
      confirmation: codeIn(preview),
    });

    expect(moved).toHaveLength(1);
  });

  it("spends the confirmation once", async () => {
    const preview = await moveItemsToUnit(waymark, MOVING);
    const code = codeIn(preview);

    await moveItemsToUnit(waymark, { ...MOVING, confirmation: code });
    await expect(
      moveItemsToUnit(waymark, { ...MOVING, confirmation: code }),
    ).rejects.toThrow();

    expect(moved).toHaveLength(1);
  });

  it("says which thing it cannot find, rather than asking for half a move", async () => {
    const refused = await moveItemsToUnit(waymark, {
      itemIds: ["iron", "not-a-thing"],
      targetStorageUnitId: "box-3",
    }).catch((caught: unknown) => caught);

    expect(String(refused)).toContain("not-a-thing");
    expect(moved).toEqual([]);
  });

  it("points out anything that is already where it would be moved to", async () => {
    const preview = await moveItemsToUnit(waymark, {
      itemIds: ["iron", "already"],
      targetStorageUnitId: "box-3",
    });

    expect(preview).toMatch(/already/iu);
    expect(preview).toContain("Spare fuses");
  });

  it("says a read-only token cannot move anything, before previewing", async () => {
    withScope("read");

    const refused = await moveItemsToUnit(waymark, MOVING).catch((caught: unknown) => caught);

    expect(moved).toEqual([]);
    expect(String(refused)).toContain("read-only");
    expect(String(refused)).toContain("read-write");
    expect(String(refused)).not.toMatch(/confirmation: "/u);
  });
});
