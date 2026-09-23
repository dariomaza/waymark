import { anItem, aStorageUnit, withPhoto } from "@waymark/api-client/testing";
import { StorageUnitKind } from "@waymark/domain";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { aClient, API_URL, stubbedApi } from "../testing/api.js";
import { inspectStorageUnit } from "./unit.js";

const apiServer = stubbedApi();

const GARAGE = aStorageUnit({ id: "garage", name: "Garage", kind: StorageUnitKind.ROOM });
const BOX = aStorageUnit({
  id: "box-3",
  parentId: "garage",
  name: "Box 3",
  description: "Spare video cables",
});

const answering = (body: Parameters<typeof HttpResponse.json>[0]): void => {
  apiServer.use(http.get(`${API_URL}/storage-units/box-3`, () => HttpResponse.json(body)));
};

describe("looking inside one storage unit", () => {
  it("says where the unit itself is, not only what it is called", async () => {
    answering({ unit: withPhoto(BOX), path: [GARAGE, BOX], children: [], items: [] });

    const answer = await inspectStorageUnit(aClient(), { storageUnitId: "box-3" });

    expect(answer).toContain("Garage > Box 3");
  });

  it("lists the units it holds and the items it holds, apart", async () => {
    answering({
      unit: withPhoto(BOX),
      path: [GARAGE, BOX],
      children: [aStorageUnit({ id: "tin", parentId: "box-3", name: "Small tin" })],
      items: [anItem({ id: "hdmi", name: "Cable HDMI 2.1", quantity: 4, tags: ["video"] })],
    });

    const answer = await inspectStorageUnit(aClient(), { storageUnitId: "box-3" });

    expect(answer).toContain("Small tin");
    expect(answer).toContain("Cable HDMI 2.1");
    expect(answer).toContain("x4");
    expect(answer.indexOf("Small tin")).toBeLessThan(answer.indexOf("Cable HDMI 2.1"));
  });

  it("gives the description, which a list of many units could not afford to", async () => {
    answering({ unit: withPhoto(BOX), path: [GARAGE, BOX], children: [], items: [] });

    expect(await inspectStorageUnit(aClient(), { storageUnitId: "box-3" })).toContain(
      "Spare video cables",
    );
  });

  it("says an empty unit is empty rather than answering with two headings", async () => {
    answering({ unit: withPhoto(BOX), path: [GARAGE, BOX], children: [], items: [] });

    const answer = await inspectStorageUnit(aClient(), { storageUnitId: "box-3" });

    expect(answer).toMatch(/empty|holds nothing/iu);
  });

  it("gives the code printed on the label, so a scuffed sticker can be read aloud", async () => {
    answering({ unit: withPhoto(BOX), path: [GARAGE, BOX], children: [], items: [] });

    expect(await inspectStorageUnit(aClient(), { storageUnitId: "box-3" })).toContain(
      BOX.publicId,
    );
  });

  it("says plainly when there is no such unit, and what to do instead", async () => {
    apiServer.use(
      http.get(`${API_URL}/storage-units/box-3`, () =>
        HttpResponse.json(
          { error: { code: "STORAGE_UNIT_NOT_FOUND", message: "no storage unit box-3" } },
          { status: 404 },
        ),
      ),
    );

    await expect(
      inspectStorageUnit(aClient(), { storageUnitId: "box-3" }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
