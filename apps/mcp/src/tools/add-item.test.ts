import { anItem, aStorageUnit, withPhoto } from "@waymark/api-client/testing";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { aMachineToken, aWaymark, API_URL, stubbedApi } from "../testing/api.js";
import { addItemToUnit, type AddItemArguments } from "./add-item.js";
import type { Waymark } from "./answering.js";

const apiServer = stubbedApi();

const GARAGE = aStorageUnit({ id: "garage", name: "Garage" });
const BOX = aStorageUnit({ id: "box-3", parentId: "garage", name: "Box 3" });

let written: unknown[] = [];
let waymark: Waymark;

const withScope = (scope: "read" | "read-write"): void => {
  apiServer.use(http.get(`${API_URL}/auth/me`, () => HttpResponse.json(aMachineToken(scope))));
};

beforeEach(() => {
  written = [];
  waymark = aWaymark();
  withScope("read-write");
  apiServer.use(
    http.get(`${API_URL}/storage-units/box-3`, () =>
      HttpResponse.json({ unit: withPhoto(BOX), path: [GARAGE, BOX], children: [], items: [] }),
    ),
    http.post(`${API_URL}/items`, async ({ request }) => {
      written.push(await request.json());

      return HttpResponse.json({ item: anItem({ id: "iron", name: "Soldering iron" }) }, {
        status: 201,
      });
    }),
  );
});

const ADDING: AddItemArguments = {
  storageUnitId: "box-3",
  name: "Soldering iron",
  quantity: 2,
  tags: ["tools"],
};

/** The code out of a preview, which is the only place one ever comes from. */
const codeIn = (preview: string): string =>
  /confirmation: "([^"]+)"/u.exec(preview)?.[1] ?? "no code was offered";

describe("adding an item, which does not happen on the first call", () => {
  it("writes nothing at all, and describes what it would do instead", async () => {
    const preview = await addItemToUnit(waymark, ADDING);

    expect(written).toEqual([]);
    expect(preview).toContain("Soldering iron");
    expect(preview).toContain("Box 3");
    expect(preview).toMatch(/nothing has been added/iu);
  });

  /** In words a person can check: a place, not an id. */
  it("names the destination by its full path, not by the id it was given", async () => {
    expect(await addItemToUnit(waymark, ADDING)).toContain("Garage > Box 3");
  });

  it("does it once the confirmation it issued comes back", async () => {
    const preview = await addItemToUnit(waymark, ADDING);

    const done = await addItemToUnit(waymark, {
      ...ADDING,
      confirmation: codeIn(preview),
    });

    expect(written).toEqual([
      {
        storageUnitId: "box-3",
        name: "Soldering iron",
        description: null,
        quantity: 2,
        tags: ["tools"],
      },
    ]);
    expect(done).toMatch(/added/iu);
    expect(done).toContain("Garage > Box 3");
  });

  it.each(["yes", "true", "confirm", "I confirm", "CONFIRMED"])(
    "refuses %o and writes nothing, because a guess is not a confirmation",
    async (guess) => {
      await addItemToUnit(waymark, ADDING);

      const refused = await addItemToUnit(waymark, { ...ADDING, confirmation: guess }).catch(
        (caught: unknown) => caught,
      );

      expect(written).toEqual([]);
      expect(String(refused)).toMatch(/not a confirmation|nothing was added/iu);
    },
  );

  it("refuses a confirmation that was issued for a different addition", async () => {
    const preview = await addItemToUnit(waymark, ADDING);

    await expect(
      addItemToUnit(waymark, {
        ...ADDING,
        name: "Something else entirely",
        confirmation: codeIn(preview),
      }),
    ).rejects.toThrow();
    expect(written).toEqual([]);
  });

  it("spends a confirmation once, so a repeated call cannot add twice", async () => {
    const preview = await addItemToUnit(waymark, ADDING);
    const code = codeIn(preview);

    await addItemToUnit(waymark, { ...ADDING, confirmation: code });
    await expect(addItemToUnit(waymark, { ...ADDING, confirmation: code })).rejects.toThrow();

    expect(written).toHaveLength(1);
  });

  /**
   * The belt, in front of the braces: the API would refuse this with a 403,
   * and a reader can do nothing with a 403.
   */
  it("says a read-only token cannot write, before previewing anything", async () => {
    withScope("read");

    const refused = await addItemToUnit(waymark, ADDING).catch((caught: unknown) => caught);

    expect(written).toEqual([]);
    expect(String(refused)).toContain("read-only");
    expect(String(refused)).toContain("mcp-server");
    expect(String(refused)).toContain("read-write");
    expect(String(refused)).not.toMatch(/confirmation: "/u);
  });

  it("still refuses a read-only token that arrives holding a confirmation", async () => {
    const preview = await addItemToUnit(waymark, ADDING);
    withScope("read");
    const cold = aWaymark();

    await expect(
      addItemToUnit(cold, { ...ADDING, confirmation: codeIn(preview) }),
    ).rejects.toThrow(/read-only/u);
    expect(written).toEqual([]);
  });
});
