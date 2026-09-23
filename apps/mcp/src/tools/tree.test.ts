import { aStorageUnit, aTree } from "@waymark/api-client/testing";
import { StorageUnitKind } from "@waymark/domain";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { aClient, API_URL, stubbedApi } from "../testing/api.js";
import { storageUnitTree } from "./tree.js";

const apiServer = stubbedApi();

const answering = (body: Parameters<typeof HttpResponse.json>[0]): void => {
  apiServer.use(http.get(`${API_URL}/storage-units`, () => HttpResponse.json(body)));
};

const A_FOREST = [
  aTree(aStorageUnit({ id: "garage", name: "Garage", kind: StorageUnitKind.ROOM }), [
    aTree(
      aStorageUnit({
        id: "wardrobe",
        parentId: "garage",
        name: "Metal wardrobe",
        kind: StorageUnitKind.FURNITURE,
      }),
      [aTree(aStorageUnit({ id: "box-3", parentId: "wardrobe", name: "Box 3" }))],
    ),
  ]),
  aTree(aStorageUnit({ id: "office", name: "Office", kind: StorageUnitKind.ROOM })),
];

describe("the shape of the whole inventory", () => {
  it("draws the forest as an outline, so depth is read rather than counted", async () => {
    answering({ tree: A_FOREST });

    const answer = await storageUnitTree(aClient());
    const lines = answer.split("\n");

    expect(lines.find((line) => line.includes("Garage"))).toMatch(/^Garage/u);
    expect(lines.find((line) => line.includes("Metal wardrobe"))).toMatch(/^ {2}\S/u);
    expect(lines.find((line) => line.includes("Box 3"))).toMatch(/^ {4}\S/u);
  });

  it("counts what it is showing, because 'some boxes' answers nothing", async () => {
    answering({ tree: A_FOREST });

    expect(await storageUnitTree(aClient())).toContain("4");
  });

  it("gives every unit's id, so the next question can name one", async () => {
    answering({ tree: A_FOREST });

    const answer = await storageUnitTree(aClient());

    expect(answer).toContain("box-3");
    expect(answer).toContain("office");
  });

  it("says a fresh installation is empty rather than answering with a blank", async () => {
    answering({ tree: [] });

    expect(await storageUnitTree(aClient())).toMatch(/no storage units/iu);
  });
});

/**
 * The reason this answer is not JSON, as a number rather than an assertion.
 *
 * Forty boxes of nested objects is mostly punctuation and repeated keys, and
 * every character of it is paid for out of the budget of the model that has to
 * read it and then answer a person. If a change ever makes this outline
 * expensive again, this is what says so.
 */
describe("what the outline costs next to the JSON it replaces", () => {
  const aForestOf = (count: number): unknown[] =>
    Array.from({ length: count / 4 }, (_unused, room) =>
      aTree(aStorageUnit({ id: `room-${room}`, name: `Room ${room}` }), [
        aTree(
          aStorageUnit({ id: `shelf-${room}`, parentId: `room-${room}`, name: "Shelf" }),
          [
            aTree(aStorageUnit({ id: `box-${room}-a`, parentId: `shelf-${room}` })),
            aTree(aStorageUnit({ id: `box-${room}-b`, parentId: `shelf-${room}` })),
          ],
        ),
      ]),
    );

  it("is a fraction of the size, for a forty-unit inventory", async () => {
    const tree = aForestOf(40);
    answering({ tree });

    const outline = await storageUnitTree(aClient());

    expect(outline.length).toBeLessThan(JSON.stringify({ tree }).length * 0.35);
  });
});
