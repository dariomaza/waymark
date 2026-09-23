import { anItem, anItemHit, aStorageUnit, aUnitHit } from "@waymark/api-client/testing";
import { SearchMatchField, StorageUnitKind } from "@waymark/domain";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { aClient, API_URL, stubbedApi } from "../testing/api.js";
import { searchInventory } from "./search.js";

const apiServer = stubbedApi();

const GARAGE = aStorageUnit({ id: "garage", name: "Garage", kind: StorageUnitKind.ROOM });
const WARDROBE = aStorageUnit({
  id: "wardrobe",
  parentId: "garage",
  name: "Metal wardrobe",
  kind: StorageUnitKind.FURNITURE,
});
const BOX = aStorageUnit({ id: "box-3", parentId: "wardrobe", name: "Box 3" });

const answering = (body: Parameters<typeof HttpResponse.json>[0]): void => {
  apiServer.use(http.get(`${API_URL}/search`, () => HttpResponse.json(body)));
};

describe("searching the inventory", () => {
  /** The whole question the product exists to answer. */
  it("says where every hit is, in full, root first", async () => {
    answering({
      query: "soldering",
      terms: ["soldering"],
      items: [
        anItemHit(anItem({ id: "iron", name: "Soldering iron" }), [GARAGE, WARDROBE, BOX]),
      ],
      storageUnits: [],
    });

    const answer = await searchInventory(aClient(), { query: "soldering" });

    expect(answer).toContain("Soldering iron");
    expect(answer).toContain("Garage > Metal wardrobe > Box 3");
  });

  it("gives the id of every hit, so the thing found can then be addressed", async () => {
    answering({
      query: "soldering",
      terms: ["soldering"],
      items: [anItemHit(anItem({ id: "iron", name: "Soldering iron" }), [GARAGE, BOX])],
      storageUnits: [aUnitHit(BOX, [GARAGE, BOX])],
    });

    const answer = await searchInventory(aClient(), { query: "soldering" });

    expect(answer).toContain("iron");
    expect(answer).toContain("box-3");
  });

  it("keeps items and storage units apart, because they answer two questions", async () => {
    answering({
      query: "cable",
      terms: ["cable"],
      items: [
        anItemHit(anItem({ id: "hdmi", name: "Cable HDMI 2.1" }), [GARAGE, BOX], [
          SearchMatchField.TAG,
        ]),
      ],
      storageUnits: [aUnitHit(aStorageUnit({ id: "tin", name: "Cable tin" }), [GARAGE])],
    });

    const answer = await searchInventory(aClient(), { query: "cable" });

    expect(answer).toMatch(/items?\b/iu);
    expect(answer).toMatch(/storage units?\b/iu);
    expect(answer.indexOf("Cable HDMI 2.1")).toBeLessThan(answer.indexOf("Cable tin"));
  });

  it("says why a hit is a hit", async () => {
    answering({
      query: "cable",
      terms: ["cable"],
      items: [
        anItemHit(anItem({ id: "hdmi", name: "HDMI 2.1", tags: ["cables"] }), [BOX], [
          SearchMatchField.TAG,
        ]),
      ],
      storageUnits: [],
    });

    expect(await searchInventory(aClient(), { query: "cable" })).toMatch(/tag/iu);
  });

  it("leaves out what is only ever the default, rather than spending a reader's budget on it", async () => {
    answering({
      query: "drill",
      terms: ["drill"],
      items: [anItemHit(anItem({ id: "drill", quantity: 1, tags: [] }), [GARAGE])],
      storageUnits: [],
    });

    const answer = await searchInventory(aClient(), { query: "drill" });

    expect(answer).not.toContain("x1");
    expect(answer).not.toMatch(/tags:/u);
  });

  it("says a quantity that is not one, and the tags when there are any", async () => {
    answering({
      query: "cable",
      terms: ["cable"],
      items: [
        anItemHit(anItem({ id: "hdmi", quantity: 4, tags: ["cables", "video"] }), [BOX]),
      ],
      storageUnits: [],
    });

    const answer = await searchInventory(aClient(), { query: "cable" });

    expect(answer).toContain("x4");
    expect(answer).toContain("cables, video");
  });

  it("answers nothing found with the rule that explains it", async () => {
    answering({ query: "cable usb", terms: ["cable", "usb"], items: [], storageUnits: [] });

    const answer = await searchInventory(aClient(), { query: "cable usb" });

    expect(answer).toMatch(/nothing/iu);
    expect(answer).toContain("cable usb");
    expect(answer).toMatch(/every term/iu);
  });

  it("passes a subtree and a limit through to the API rather than filtering here", async () => {
    const asked: string[] = [];
    apiServer.use(
      http.get(`${API_URL}/search`, ({ request }) => {
        asked.push(new URL(request.url).search);
        return HttpResponse.json({ query: "x", terms: ["x"], items: [], storageUnits: [] });
      }),
    );

    await searchInventory(aClient(), {
      query: "x",
      withinStorageUnitId: "garage",
      limit: 5,
    });

    expect(asked[0]).toContain("within=garage");
    expect(asked[0]).toContain("limit=5");
  });
});
