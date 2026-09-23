import { anItem, aStorageUnit } from "@waymark/api-client/testing";
import type { StorageUnitView } from "@waymark/api-client";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { aClient, API_URL, stubbedApi } from "../testing/api.js";
import { listEverything } from "./items.js";

const apiServer = stubbedApi();

const GARAGE = aStorageUnit({ id: "garage", name: "Garage" });
const BOX = aStorageUnit({ id: "box-3", parentId: "garage", name: "Box 3" });

const at = (
  item: ReturnType<typeof anItem>,
  path: readonly StorageUnitView[],
): Record<string, unknown> => ({
  item,
  path,
  location: path.map((step) => step.name).join(" > "),
});

const answering = (body: Parameters<typeof HttpResponse.json>[0]): void => {
  apiServer.use(http.get(`${API_URL}/items`, () => HttpResponse.json(body)));
};

describe("everything in the house", () => {
  it("puts where each thing is on the same line as what it is", async () => {
    answering({
      items: [at(anItem({ id: "iron", name: "Soldering iron" }), [GARAGE, BOX])],
    });

    const answer = await listEverything(aClient());
    const line = answer.split("\n").find((one) => one.includes("Soldering iron")) ?? "";

    expect(line).toContain("Garage > Box 3");
    expect(line).toContain("iron");
  });

  it("spends one line on each item, because the list is the whole inventory", async () => {
    answering({
      items: [
        at(anItem({ id: "a", name: "A" }), [GARAGE]),
        at(anItem({ id: "b", name: "B" }), [GARAGE]),
        at(anItem({ id: "c", name: "C" }), [GARAGE]),
      ],
    });

    const answer = await listEverything(aClient());
    const rows = answer.split("\n").filter((line) => /\bid: [abc]\b/u.test(line));

    expect(rows).toHaveLength(3);
  });

  it("counts them, and says so before listing them", async () => {
    answering({
      items: [at(anItem({ id: "a" }), [GARAGE]), at(anItem({ id: "b" }), [GARAGE])],
    });

    expect(await listEverything(aClient())).toMatch(/^Waymark holds 2 items/u);
  });

  it("says an empty inventory is empty", async () => {
    answering({ items: [] });

    expect(await listEverything(aClient())).toMatch(/no items/iu);
  });
});

/** The same measurement, where it matters most: the longest answer given. */
describe("what one line per item costs next to the JSON it replaces", () => {
  it("is a fraction of the size, for a two-hundred-item inventory", async () => {
    const items = Array.from({ length: 200 }, (_unused, index) =>
      at(anItem({ id: `item-${index}`, name: `Thing ${index}` }), [GARAGE, BOX]),
    );
    answering({ items });

    const listed = await listEverything(aClient());

    expect(listed.length).toBeLessThan(JSON.stringify({ items }).length * 0.25);
  });
});
