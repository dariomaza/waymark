import { PhotoProcessingStatus, ShareLevel, StorageUnitKind } from "@waymark/domain";
import type { InjectOptions, LightMyRequestResponse } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { MachineTokenScope } from "../auth/machine-token.js";
import { aPlainImage } from "../photos/testing/image-fixtures.js";
import { multipartBody } from "./testing/multipart.js";
import {
  TEST_PASSWORD,
  TEST_USERNAME,
  createTestApi,
  type TestApi,
} from "./testing/test-api.js";

interface UnitView {
  readonly id: string;
  readonly name: string;
}

interface TreeNode extends UnitView {
  readonly children: readonly TreeNode[];
}

interface ItemView {
  readonly id: string;
  readonly name: string;
}

type Person = "admin" | "ana" | "bea";

const errorOf = (response: LightMyRequestResponse) => ({
  status: response.statusCode,
  code: (response.json() as { error: { code: string } }).error.code,
});

/** The names a response carries, wherever in its body they are. */
const namesIn = (response: LightMyRequestResponse, among: readonly string[]): string[] =>
  among.filter((name) => response.body.includes(name));

const flatten = (nodes: readonly TreeNode[]): string[] =>
  nodes.flatMap((node) => [node.name, ...flatten(node.children)]);

/** Every name Bea must never read, wherever an answer might carry it. */
const HIDDEN_FROM_BEA = [
  "Ana house",
  "Ana safe",
  "Ana jewel box",
  "Ana tent",
  "Ana passport",
  "Ana ring",
];

const BEAS_NAMES = ["Bea flat", "Bea wardrobe", "Bea scarf"];

/**
 * # What each person may see, over HTTP (ADR 26)
 *
 * The same household as the contract suite's invisibility fixture, built
 * through the routes by the people who own it. Ana's house holds a garage
 * shared with Bea to view, an attic shared with Bea to edit and a safe shared
 * with nobody. Bea has a flat. Dario made the first account, so he is the
 * administrator.
 *
 * For an unseen thing the answer is the one a missing id gets, status AND
 * code, so nobody can tell an id that is real from one that was never issued.
 */
describe("what each person may see over HTTP (ADR 26)", () => {
  let api: TestApi;
  const tokens = new Map<Person, string>();
  const spaces = new Map<string, UnitView>();
  const items = new Map<string, ItemView>();

  beforeAll(async () => {
    api = await createTestApi();
  });

  afterAll(async () => {
    await api.destroy();
  });

  const as = async (
    person: Person,
    options: InjectOptions,
  ): Promise<LightMyRequestResponse> =>
    api.app.inject({
      ...options,
      headers: { ...options.headers, ...api.authHeaders(tokens.get(person) ?? "") },
    });

  const space = async (
    person: Person,
    name: string,
    parent: string | null = null,
  ): Promise<UnitView> => {
    const response = await as(person, {
      method: "POST",
      url: "/storage-units",
      payload: {
        name,
        kind: StorageUnitKind.BOX,
        parentId: parent === null ? null : spaces.get(parent)?.id,
      },
    });
    expect(response.statusCode).toBe(201);
    const unit = (response.json() as { unit: UnitView }).unit;
    spaces.set(name, unit);

    return unit;
  };

  const item = async (person: Person, name: string, within: string): Promise<void> => {
    const response = await as(person, {
      method: "POST",
      url: "/items",
      payload: { name, storageUnitId: spaces.get(within)?.id },
    });
    expect(response.statusCode).toBe(201);
    items.set(name, (response.json() as { item: ItemView }).item);
  };

  const idOf = (name: string): string => {
    const id = spaces.get(name)?.id ?? items.get(name)?.id;
    if (id === undefined) {
      throw new Error(`Nothing called "${name}" in the fixture`);
    }

    return id;
  };

  beforeEach(async () => {
    await api.reset();
    spaces.clear();
    items.clear();
    await api.createUser(TEST_USERNAME, TEST_PASSWORD);
    await api.createUser("ana", "anas-password");
    await api.createUser("bea", "beas-password");
    tokens.set("admin", await api.login());
    tokens.set("ana", await api.login("ana", "anas-password"));
    tokens.set("bea", await api.login("bea", "beas-password"));

    await space("ana", "Ana house");
    await space("ana", "Ana garage", "Ana house");
    await space("ana", "Ana shelf", "Ana garage");
    await space("ana", "Ana attic", "Ana house");
    await space("ana", "Ana safe", "Ana house");
    await space("ana", "Ana jewel box", "Ana safe");
    await item("ana", "Ana tent", "Ana house");
    await item("ana", "Ana drill", "Ana shelf");
    await item("ana", "Ana lamp", "Ana attic");
    await item("ana", "Ana passport", "Ana safe");
    await item("ana", "Ana ring", "Ana jewel box");

    await space("bea", "Bea flat");
    await space("bea", "Bea wardrobe", "Bea flat");
    await item("bea", "Bea scarf", "Bea wardrobe");

    await api.share(idOf("Ana garage"), "bea", ShareLevel.VIEW);
    await api.share(idOf("Ana attic"), "bea", ShareLevel.EDIT);
  });

  /** What a missing id of this kind gets, to compare an unseen one against. */
  const missing = async (url: string) =>
    errorOf(await as("bea", { method: "GET", url }));

  describe("GET /storage-units", () => {
    const treeOf = async (person: Person) => {
      const response = await as(person, { method: "GET", url: "/storage-units" });
      expect(response.statusCode).toBe(200);

      return response;
    };

    it("puts what was shared with Bea at the top of her tree, beside her own", async () => {
      const response = await treeOf("bea");
      const tree = (response.json() as { tree: TreeNode[] }).tree;

      expect(tree.map((node) => node.name)).toEqual([
        "Ana attic",
        "Ana garage",
        "Bea flat",
      ]);
      expect(flatten(tree).sort()).toEqual(
        ["Ana attic", "Ana garage", "Ana shelf", "Bea flat", "Bea wardrobe"].sort(),
      );
      expect(namesIn(response, HIDDEN_FROM_BEA)).toEqual([]);
    });

    it("shows Ana her whole house and nothing of Bea's", async () => {
      const response = await treeOf("ana");
      const tree = (response.json() as { tree: TreeNode[] }).tree;

      expect(tree.map((node) => node.name)).toEqual(["Ana house"]);
      expect(namesIn(response, BEAS_NAMES)).toEqual([]);
    });

    it("shows the administrator everybody's tree", async () => {
      const tree = ((await treeOf("admin")).json() as { tree: TreeNode[] }).tree;

      expect(tree.map((node) => node.name)).toEqual(["Ana house", "Bea flat"]);
    });
  });

  describe("a machine token", () => {
    it("sees exactly what the person who issued it sees, and nothing more", async () => {
      const token = await api.createMachineToken(
        "beas-assistant",
        MachineTokenScope.Read,
        undefined,
        "bea",
      );

      const tree = await api.app.inject({
        method: "GET",
        url: "/storage-units",
        headers: api.machineHeaders(token),
      });
      const safe = await api.app.inject({
        method: "GET",
        url: `/storage-units/${idOf("Ana safe")}`,
        headers: api.machineHeaders(token),
      });

      expect(flatten((tree.json() as { tree: TreeNode[] }).tree).sort()).toEqual(
        ["Ana attic", "Ana garage", "Ana shelf", "Bea flat", "Bea wardrobe"].sort(),
      );
      expect(safe.statusCode).toBe(404);
    });
  });

  describe("GET /storage-units/:id", () => {
    it.each([["Ana house"], ["Ana safe"], ["Ana jewel box"]])(
      "answers Bea about %s exactly as it answers about an id that was never issued",
      async (name) => {
        const response = await as("bea", {
          method: "GET",
          url: `/storage-units/${idOf(name)}`,
        });

        expect(errorOf(response)).toEqual(
          await missing("/storage-units/never-issued"),
        );
        expect(errorOf(response).status).toBe(404);
        expect(namesIn(response, HIDDEN_FROM_BEA)).toEqual([]);
      },
    );

    it("opens a shared shelf for Bea under a breadcrumb that starts at the share", async () => {
      const response = await as("bea", {
        method: "GET",
        url: `/storage-units/${idOf("Ana shelf")}`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { path: UnitView[]; items: ItemView[] };
      expect(body.path.map((unit) => unit.name)).toEqual(["Ana garage", "Ana shelf"]);
      expect(body.items.map((thing) => thing.name)).toEqual(["Ana drill"]);
      expect(namesIn(response, HIDDEN_FROM_BEA)).toEqual([]);
    });

    it("does not open Bea's wardrobe for Ana", async () => {
      const response = await as("ana", {
        method: "GET",
        url: `/storage-units/${idOf("Bea wardrobe")}`,
      });

      expect(errorOf(response)).toEqual(await missing("/storage-units/never-issued"));
    });

    it("opens Ana's safe for Ana and for the administrator, whole", async () => {
      for (const person of ["ana", "admin"] as const) {
        const response = await as(person, {
          method: "GET",
          url: `/storage-units/${idOf("Ana jewel box")}`,
        });

        expect(response.statusCode).toBe(200);
        const body = response.json() as { path: UnitView[] };
        expect(body.path.map((unit) => unit.name)).toEqual([
          "Ana house",
          "Ana safe",
          "Ana jewel box",
        ]);
      }
    });
  });

  describe("GET /items", () => {
    interface Row {
      readonly item: ItemView;
      readonly path: readonly UnitView[];
    }

    const everythingOf = async (person: Person) => {
      const response = await as(person, { method: "GET", url: "/items" });
      expect(response.statusCode).toBe(200);

      return response;
    };

    const rowsOf = (response: LightMyRequestResponse): Row[] =>
      (response.json() as { items: Row[] }).items;

    it("lists for Bea her own and what the shared spaces hold, located from the share down", async () => {
      const response = await everythingOf("bea");
      const rows = rowsOf(response);

      expect(rows.map((row) => row.item.name)).toEqual([
        "Ana drill",
        "Ana lamp",
        "Bea scarf",
      ]);
      expect(rows[0]?.path.map((unit) => unit.name)).toEqual(["Ana garage", "Ana shelf"]);
      expect(namesIn(response, HIDDEN_FROM_BEA)).toEqual([]);
    });

    it("lists for Ana all of hers and none of Bea's", async () => {
      const response = await everythingOf("ana");

      expect(rowsOf(response)).toHaveLength(5);
      expect(namesIn(response, BEAS_NAMES)).toEqual([]);
    });

    it("lists everything for the administrator", async () => {
      expect(rowsOf(await everythingOf("admin"))).toHaveLength(6);
    });
  });

  describe("GET /items/:id", () => {
    it.each([["Ana tent"], ["Ana passport"], ["Ana ring"]])(
      "answers Bea about %s exactly as it answers about an id that was never issued",
      async (name) => {
        const response = await as("bea", { method: "GET", url: `/items/${idOf(name)}` });

        expect(errorOf(response)).toEqual(await missing("/items/never-issued"));
        expect(errorOf(response).status).toBe(404);
        expect(namesIn(response, HIDDEN_FROM_BEA)).toEqual([]);
      },
    );

    it("opens a shared item for Bea, located from the share down", async () => {
      const response = await as("bea", {
        method: "GET",
        url: `/items/${idOf("Ana drill")}`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { path: UnitView[]; storageUnit: UnitView };
      expect(body.path.map((unit) => unit.name)).toEqual(["Ana garage", "Ana shelf"]);
      expect(body.storageUnit.name).toBe("Ana shelf");
      expect(namesIn(response, HIDDEN_FROM_BEA)).toEqual([]);
    });

    it("does not open Bea's scarf for Ana", async () => {
      const response = await as("ana", { method: "GET", url: `/items/${idOf("Bea scarf")}` });

      expect(errorOf(response)).toEqual(await missing("/items/never-issued"));
    });

    it("opens Bea's scarf for the administrator", async () => {
      const response = await as("admin", {
        method: "GET",
        url: `/items/${idOf("Bea scarf")}`,
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe("GET /search", () => {
    interface Answer {
      readonly items: readonly { readonly item: ItemView; readonly path: UnitView[] }[];
      readonly storageUnits: readonly { readonly unit: UnitView }[];
    }

    const search = async (person: Person, query: string) =>
      as(person, { method: "GET", url: `/search?${query}` });

    const namesFound = (response: LightMyRequestResponse) => {
      const body = response.json() as Answer;

      return {
        items: body.items.map((result) => result.item.name),
        storageUnits: body.storageUnits.map((result) => result.unit.name).sort(),
      };
    };

    it("finds for Bea only what was shared with her, located from the share down", async () => {
      const response = await search("bea", "q=ana");

      expect(response.statusCode).toBe(200);
      expect(namesFound(response)).toEqual({
        items: ["Ana drill", "Ana lamp"],
        storageUnits: ["Ana attic", "Ana garage", "Ana shelf"],
      });
      expect(namesIn(response, HIDDEN_FROM_BEA)).toEqual([]);
    });

    it("finds for Bea within a shared space", async () => {
      const response = await search("bea", `q=ana&within=${idOf("Ana garage")}`);

      expect(namesFound(response)).toEqual({
        items: ["Ana drill"],
        storageUnits: ["Ana shelf"],
      });
    });

    it("answers Bea about a scope she may not see exactly as about one that does not exist", async () => {
      const unseen = await search("bea", `q=ana&within=${idOf("Ana safe")}`);
      const absent = await search("bea", "q=ana&within=never-issued");

      expect(errorOf(unseen)).toEqual(errorOf(absent));
      expect(namesIn(unseen, HIDDEN_FROM_BEA)).toEqual([]);
    });

    it("never lets Ana's matches fill Bea's limit", async () => {
      await item("ana", "Thing a1", "Ana safe");
      await item("ana", "Thing a2", "Ana safe");
      await item("bea", "Thing z", "Bea wardrobe");

      expect(namesFound(await search("bea", "q=thing&limit=1")).items).toEqual(["Thing z"]);
    });

    it("finds nothing of Bea's for Ana and everything for the administrator", async () => {
      expect(namesFound(await search("ana", "q=bea"))).toEqual({
        items: [],
        storageUnits: [],
      });
      expect(namesFound(await search("admin", "q=bea"))).toEqual({
        items: ["Bea scarf"],
        storageUnits: ["Bea flat", "Bea wardrobe"],
      });
    });
  });

  describe("photos, their bytes and the background-removal queue", () => {
    /** Photo ids by what they are a photo of. */
    const photos = new Map<string, string>();

    const upload = async (person: Person, url: string, of: string): Promise<void> => {
      const body = multipartBody({
        field: "file",
        filename: "photo.jpg",
        contentType: "image/jpeg",
        bytes: await aPlainImage("jpeg"),
      });
      const response = await as(person, {
        method: "POST",
        url,
        payload: body.payload,
        headers: { "content-type": body.contentType },
      });
      expect(response.statusCode).toBe(201);
      photos.set(of, (response.json() as { photo: { id: string } }).photo.id);
    };

    const photoOf = (of: string): string => photos.get(of) ?? "missing";

    beforeEach(async () => {
      photos.clear();
      await upload("ana", `/items/${idOf("Ana drill")}/photos`, "Ana drill");
      await upload("ana", `/items/${idOf("Ana passport")}/photos`, "Ana passport");
      await upload("ana", `/storage-units/${idOf("Ana safe")}/photo`, "Ana safe");
      await upload("bea", `/items/${idOf("Bea scarf")}/photos`, "Bea scarf");
    });

    describe.each([[""], ["/thumbnail"]])("GET /photos/:id%s", (variant) => {
      it.each([["Ana passport"], ["Ana safe"]])(
        "answers Bea about the photo of %s exactly as about a photo that does not exist",
        async (of) => {
          const response = await as("bea", {
            method: "GET",
            url: `/photos/${photoOf(of)}${variant}`,
          });

          expect(errorOf(response)).toEqual(
            await missing(`/photos/never-issued${variant}`),
          );
          expect(response.statusCode).toBe(404);
        },
      );

      it("serves Bea the photo of a shared item and of her own", async () => {
        for (const of of ["Ana drill", "Bea scarf"]) {
          const response = await as("bea", {
            method: "GET",
            url: `/photos/${photoOf(of)}${variant}`,
          });

          expect(response.statusCode).toBe(200);
        }
      });

      it("does not serve Ana the photo of Bea's scarf", async () => {
        const response = await as("ana", {
          method: "GET",
          url: `/photos/${photoOf("Bea scarf")}${variant}`,
        });

        expect(errorOf(response)).toEqual(await missing(`/photos/never-issued${variant}`));
      });

      it("serves the administrator every photo", async () => {
        for (const of of ["Ana passport", "Ana safe", "Bea scarf"]) {
          const response = await as("admin", {
            method: "GET",
            url: `/photos/${photoOf(of)}${variant}`,
          });

          expect(response.statusCode).toBe(200);
        }
      });
    });

    describe("GET /photos/processing", () => {
      interface Queue {
        readonly counts: Record<string, number>;
        readonly abandoned: readonly { readonly photoId: string }[];
      }

      /** Every photo gave up, so each one is listed with its reason. */
      const abandonEverything = async (): Promise<void> => {
        const client = api.database.client;
        await client.photo.updateMany({
          data: { processingStatus: PhotoProcessingStatus.FAILED },
        });
        for (const id of photos.values()) {
          await client.photoProcessingAttempt.create({
            data: {
              photoId: id,
              attempts: 3,
              nextAttemptAt: new Date(),
              lastError: "the sidecar refused it",
              updatedAt: new Date(),
            },
          });
        }
      };

      const queueSeenBy = async (person: Person): Promise<Queue> => {
        const response = await as(person, { method: "GET", url: "/photos/processing" });
        expect(response.statusCode).toBe(200);

        return response.json() as Queue;
      };

      const total = (queue: Queue): number =>
        Object.values(queue.counts).reduce((sum, count) => sum + count, 0);

      it("counts and lists for Bea only the photos she may see", async () => {
        await abandonEverything();

        const queue = await queueSeenBy("bea");

        expect(total(queue)).toBe(2);
        expect(queue.abandoned.map((photo) => photo.photoId).sort()).toEqual(
          [photoOf("Ana drill"), photoOf("Bea scarf")].sort(),
        );
      });

      it("counts and lists for Ana only hers", async () => {
        await abandonEverything();

        const queue = await queueSeenBy("ana");

        expect(total(queue)).toBe(3);
        expect(queue.abandoned.map((photo) => photo.photoId)).not.toContain(
          photoOf("Bea scarf"),
        );
      });

      it("counts and lists everything for the administrator", async () => {
        await abandonEverything();

        const queue = await queueSeenBy("admin");

        expect(total(queue)).toBe(4);
        expect(queue.abandoned).toHaveLength(4);
      });
    });
  });

  describe.each([["png"], ["svg"]])("GET /storage-units/:id/qr.%s", (format) => {
    it.each([["Ana house"], ["Ana safe"], ["Ana jewel box"]])(
      "answers Bea about the label of %s exactly as about a space that does not exist",
      async (name) => {
        const response = await as("bea", {
          method: "GET",
          url: `/storage-units/${idOf(name)}/qr.${format}`,
        });

        expect(errorOf(response)).toEqual(
          await missing(`/storage-units/never-issued/qr.${format}`),
        );
        expect(response.statusCode).toBe(404);
      },
    );

    it("draws Bea the label of a shared space and of her own", async () => {
      for (const name of ["Ana shelf", "Bea wardrobe"]) {
        const response = await as("bea", {
          method: "GET",
          url: `/storage-units/${idOf(name)}/qr.${format}`,
        });

        expect(response.statusCode).toBe(200);
      }
    });

    it("does not draw Ana the label of Bea's flat, and draws the administrator any", async () => {
      const ana = await as("ana", {
        method: "GET",
        url: `/storage-units/${idOf("Bea flat")}/qr.${format}`,
      });
      const admin = await as("admin", {
        method: "GET",
        url: `/storage-units/${idOf("Bea flat")}/qr.${format}`,
      });

      expect(ana.statusCode).toBe(404);
      expect(admin.statusCode).toBe(200);
    });
  });

  /**
   * # What each person may change, over HTTP (ADR 26)
   *
   * Every write route, aimed at each region of the household as Bea sees it:
   * a space of Ana's shared with nobody, the shelf she may only view, the
   * attic she may edit, and her own wardrobe. Unseen is refused exactly as a
   * never-issued id is, status and code alike; view only is 403 `VIEW_ONLY`
   * naming the space that stops the write; and both come before any refusal
   * the inventory itself would make.
   */
  describe("what each person may change", () => {
    type Region = "unshared" | "view" | "edit" | "beas";

    /** The space each region's targets sit in, which is also in that region. */
    const PARENT: Record<Region, string> = {
      unshared: "Ana safe",
      view: "Ana shelf",
      edit: "Ana attic",
      beas: "Bea wardrobe",
    };
    /** An empty space in each region, made by the administrator. */
    const PLACE: Record<Region, string> = {
      unshared: "Ana drawer",
      view: "Ana tray",
      edit: "Ana trunk",
      beas: "Bea box",
    };
    /** One item in each region. */
    const THING: Record<Region, string> = {
      unshared: "Ana passport",
      view: "Ana drill",
      edit: "Ana lamp",
      beas: "Bea scarf",
    };

    const CELLS: readonly (readonly [Person, Region, "unseen" | "view-only" | "done"])[] = [
      ["bea", "unshared", "unseen"],
      ["bea", "view", "view-only"],
      ["bea", "edit", "done"],
      ["bea", "beas", "done"],
      ["ana", "unshared", "done"],
      ["ana", "beas", "unseen"],
      ["admin", "unshared", "done"],
      ["admin", "view", "done"],
      ["admin", "edit", "done"],
      ["admin", "beas", "done"],
    ];

    /** Photo ids by the item they were added to. */
    const photos = new Map<string, string>();

    const aPhotoUpload = async () => {
      const body = multipartBody({
        field: "file",
        filename: "photo.jpg",
        contentType: "image/jpeg",
        bytes: await aPlainImage("jpeg"),
      });

      return { payload: body.payload, headers: { "content-type": body.contentType } };
    };

    beforeEach(async () => {
      photos.clear();
      for (const region of Object.keys(PLACE) as Region[]) {
        await space("admin", PLACE[region], PARENT[region]);
      }
    });

    /** The ids a write aims at, in one region. */
    interface Targets {
      readonly place: string;
      readonly parent: string;
      readonly thing: string;
      readonly photo: string;
    }

    const targetsIn = (region: Region): Targets => ({
      place: idOf(PLACE[region]),
      parent: idOf(PARENT[region]),
      thing: idOf(THING[region]),
      photo: photos.get(THING[region]) ?? "no-photo",
    });

    const NEVER_ISSUED: Targets = {
      place: "never-issued",
      parent: "never-issued",
      thing: "never-issued",
      photo: "never-issued",
    };

    interface WriteRoute {
      readonly request: (targets: Targets) => Promise<InjectOptions>;
      /** The space whose view share stops it, when it is not the place. */
      readonly blockedBy?: (targets: Targets) => string;
      /** Whether its targets need a photo on every item first. */
      readonly photos?: boolean;
    }

    const onTheThing = (targets: Targets): string => targets.parent;

    const ROUTES: Record<string, WriteRoute> = {
      "POST /storage-units inside": {
        request: async (t) => ({
          method: "POST",
          url: "/storage-units",
          payload: { name: "New box", kind: StorageUnitKind.BOX, parentId: t.place },
        }),
      },
      "POST /items inside": {
        request: async (t) => ({
          method: "POST",
          url: "/items",
          payload: { name: "New thing", storageUnitId: t.place },
        }),
      },
      "PATCH /storage-units/:id": {
        request: async (t) => ({
          method: "PATCH",
          url: `/storage-units/${t.place}`,
          payload: { name: "Renamed" },
        }),
      },
      "PATCH /items/:id": {
        request: async (t) => ({
          method: "PATCH",
          url: `/items/${t.thing}`,
          payload: { name: "Renamed" },
        }),
        blockedBy: onTheThing,
      },
      "DELETE /storage-units/:id": {
        request: async (t) => ({ method: "DELETE", url: `/storage-units/${t.place}` }),
      },
      "DELETE /items/:id": {
        request: async (t) => ({ method: "DELETE", url: `/items/${t.thing}` }),
        blockedBy: onTheThing,
      },
      "POST /storage-units/:id/empty": {
        request: async (t) => ({
          method: "POST",
          url: `/storage-units/${t.place}/empty`,
          payload: {},
        }),
      },
      "POST /storage-units/:id/move": {
        request: async (t) => ({
          method: "POST",
          url: `/storage-units/${t.place}/move`,
          payload: { parentId: t.parent },
        }),
      },
      "POST /items/move": {
        request: async (t) => ({
          method: "POST",
          url: "/items/move",
          payload: { itemIds: [t.thing], targetUnitId: t.place },
        }),
      },
      "POST /items/:id/photos": {
        request: async (t) => ({
          method: "POST",
          url: `/items/${t.thing}/photos`,
          ...(await aPhotoUpload()),
        }),
        blockedBy: onTheThing,
      },
      "POST /items/:id/photos/order": {
        request: async (t) => ({
          method: "POST",
          url: `/items/${t.thing}/photos/order`,
          payload: { photoIds: [t.photo] },
        }),
        blockedBy: onTheThing,
        photos: true,
      },
      "DELETE /items/:id/photos/:photoId": {
        request: async (t) => ({
          method: "DELETE",
          url: `/items/${t.thing}/photos/${t.photo}`,
        }),
        blockedBy: onTheThing,
        photos: true,
      },
      "POST /storage-units/:id/photo": {
        request: async (t) => ({
          method: "POST",
          url: `/storage-units/${t.place}/photo`,
          ...(await aPhotoUpload()),
        }),
      },
      "DELETE /storage-units/:id/photo": {
        request: async (t) => ({ method: "DELETE", url: `/storage-units/${t.place}/photo` }),
      },
      "POST /photos/:id/reprocess": {
        request: async (t) => ({ method: "POST", url: `/photos/${t.photo}/reprocess` }),
        blockedBy: onTheThing,
        photos: true,
      },
    };

    /** The administrator puts one photo on every item, so each region has one. */
    const photographEverything = async (): Promise<void> => {
      for (const name of Object.values(THING)) {
        const response = await as("admin", {
          method: "POST",
          url: `/items/${idOf(name)}/photos`,
          ...(await aPhotoUpload()),
        });
        expect(response.statusCode).toBe(201);
        photos.set(name, (response.json() as { photo: { id: string } }).photo.id);
      }
    };

    const detailsOf = (response: LightMyRequestResponse) =>
      (response.json() as { error: { details: Record<string, unknown> } }).error.details;

    describe.each(Object.entries(ROUTES))("%s", (_route, route) => {
      it.each(CELLS)("as %s, in the %s region: %s", async (person, region, outcome) => {
        if (route.photos === true) {
          await photographEverything();
        }
        const targets = targetsIn(region);

        const response = await as(person, await route.request(targets));

        if (outcome === "unseen") {
          const never = await as(person, await route.request(NEVER_ISSUED));
          expect(errorOf(response)).toEqual(errorOf(never));
          expect([404, 422]).toContain(response.statusCode);
        } else if (outcome === "view-only") {
          expect(errorOf(response)).toEqual({ status: 403, code: "VIEW_ONLY" });
          expect(detailsOf(response)).toMatchObject({
            storageUnitId: route.blockedBy?.(targets) ?? targets.place,
          });
        } else {
          expect(response.statusCode, response.body).toBeLessThan(300);
        }
      });
    });

    describe("POST /photos/processing/retry", () => {
      it("tries again for Bea only the photos she may change", async () => {
        await photographEverything();
        await api.database.client.photo.updateMany({ data: { processingStatus: "FAILED" } });

        const response = await as("bea", { method: "POST", url: "/photos/processing/retry" });

        expect(response.json()).toEqual({ requeued: 2 });
        const stillFailed = await api.database.client.photo.findMany({
          where: { processingStatus: "FAILED" },
          select: { id: true },
        });
        expect(stillFailed.map((photo) => photo.id).sort()).toEqual(
          [photos.get("Ana passport"), photos.get("Ana drill")].sort(),
        );
      });
    });

    describe("a refusal never reveals what may not be seen", () => {
      it("answers Bea deleting Ana's full safe as a missing space, not as one that is not empty", async () => {
        const response = await as("bea", {
          method: "DELETE",
          url: `/storage-units/${idOf("Ana safe")}`,
        });

        expect(errorOf(response)).toEqual(
          errorOf(await as("bea", { method: "DELETE", url: "/storage-units/never-issued" })),
        );
        expect(response.statusCode).toBe(404);
      });

      it("answers Bea deleting the full garage she may view as view only, not as not empty", async () => {
        const response = await as("bea", {
          method: "DELETE",
          url: `/storage-units/${idOf("Ana garage")}`,
        });

        expect(errorOf(response)).toEqual({ status: 403, code: "VIEW_ONLY" });
      });

      it("still tells Ana her own safe is not empty", async () => {
        const response = await as("ana", {
          method: "DELETE",
          url: `/storage-units/${idOf("Ana safe")}`,
        });

        expect(errorOf(response)).toEqual({ status: 409, code: "STORAGE_UNIT_NOT_EMPTY" });
      });
    });

    describe("moving between places", () => {
      const moveItems = (person: Person, names: readonly string[], into: string) =>
        as(person, {
          method: "POST",
          url: "/items/move",
          payload: { itemIds: names.map(idOf), targetUnitId: idOf(into) },
        });

      const moveSpace = (person: Person, name: string, into: string | null) =>
        as(person, {
          method: "POST",
          url: `/storage-units/${idOf(name)}/move`,
          payload: { parentId: into === null ? null : idOf(into) },
        });

      const unitOf = async (person: Person, name: string) =>
        (
          (await as(person, { method: "GET", url: `/items/${idOf(name)}` })).json() as {
            storageUnit: { name: string };
          }
        ).storageUnit.name;

      it("lets Bea move the trunk out of the attic she may edit into her own flat, which makes it hers", async () => {
        expect((await moveSpace("bea", "Ana trunk", "Bea flat")).statusCode).toBe(200);

        const forAna = await as("ana", {
          method: "GET",
          url: `/storage-units/${idOf("Ana trunk")}`,
        });
        expect(forAna.statusCode).toBe(404);
      });

      it("refuses Bea moving her scarf into the garage she may view, and into Ana's safe as if it did not exist", async () => {
        const intoGarage = await moveItems("bea", ["Bea scarf"], "Ana garage");
        const intoSafe = await moveItems("bea", ["Bea scarf"], "Ana safe");

        expect(errorOf(intoGarage)).toEqual({ status: 403, code: "VIEW_ONLY" });
        expect(errorOf(intoSafe)).toEqual(
          errorOf(
            await as("bea", {
              method: "POST",
              url: "/items/move",
              payload: { itemIds: [idOf("Bea scarf")], targetUnitId: "never-issued" },
            }),
          ),
        );
        expect(await unitOf("bea", "Bea scarf")).toBe("Bea wardrobe");
      });

      it("refuses Bea making a root of the trunk in the attic she may edit", async () => {
        const response = await moveSpace("bea", "Ana trunk", null);

        expect(errorOf(response)).toEqual({ status: 403, code: "OWNER_ONLY" });
        expect(detailsOf(response)).toEqual({ storageUnitId: idOf("Ana trunk") });
      });

      it("lets Ana and the administrator make a root of it, and it stays Ana's", async () => {
        expect((await moveSpace("admin", "Ana trunk", null)).statusCode).toBe(200);
        const forAna = await as("ana", {
          method: "GET",
          url: `/storage-units/${idOf("Ana trunk")}`,
        });

        expect(forAna.statusCode).toBe(200);
        expect((await moveSpace("ana", "Ana trunk", "Ana attic")).statusCode).toBe(200);
        expect((await moveSpace("ana", "Ana trunk", null)).statusCode).toBe(200);
      });

      it("moves nothing of several items when one is out of Bea's sight", async () => {
        const response = await moveItems(
          "bea",
          ["Bea scarf", "Ana lamp", "Ana passport"],
          "Bea box",
        );

        expect(errorOf(response)).toEqual({ status: 422, code: "ITEM_NOT_FOUND" });
        expect(await unitOf("bea", "Bea scarf")).toBe("Bea wardrobe");
        expect(await unitOf("bea", "Ana lamp")).toBe("Ana attic");
      });

      it("answers the unseen item before the view-only one, whatever the order", async () => {
        const response = await moveItems("bea", ["Ana drill", "Ana passport"], "Bea box");

        expect(errorOf(response)).toEqual({ status: 422, code: "ITEM_NOT_FOUND" });
        expect(detailsOf(response)).toEqual({ itemId: idOf("Ana passport") });
      });

      it("moves nothing of several items when one may only be viewed", async () => {
        const response = await moveItems("bea", ["Bea scarf", "Ana drill"], "Bea box");

        expect(errorOf(response)).toEqual({ status: 403, code: "VIEW_ONLY" });
        expect(await unitOf("bea", "Bea scarf")).toBe("Bea wardrobe");
      });
    });

    describe("a machine token", () => {
      const tokenOfBea = (scope: MachineTokenScope) =>
        api.createMachineToken(`beas-${scope}`, scope, undefined, "bea");

      const rename = (token: string, name: string) =>
        api.app.inject({
          method: "PATCH",
          url: `/items/${idOf(name)}`,
          headers: api.machineHeaders(token),
          payload: { name: "Renamed by a token" },
        });

      it("is refused VIEW_ONLY on the shelf when read-write and its issuer may only view it", async () => {
        const response = await rename(await tokenOfBea(MachineTokenScope.ReadWrite), "Ana drill");

        expect(errorOf(response)).toEqual({ status: 403, code: "VIEW_ONLY" });
      });

      it("may change the attic when read-write and its issuer may edit it", async () => {
        const response = await rename(await tokenOfBea(MachineTokenScope.ReadWrite), "Ana lamp");

        expect(response.statusCode).toBe(200);
      });

      it("is refused READ_ONLY_MACHINE_TOKEN on any write when read, even where its issuer may edit", async () => {
        const response = await rename(await tokenOfBea(MachineTokenScope.Read), "Ana lamp");

        expect(errorOf(response)).toEqual({ status: 403, code: "READ_ONLY_MACHINE_TOKEN" });
      });

      it.each([[MachineTokenScope.Read], [MachineTokenScope.ReadWrite]])(
        "finds nothing its issuer cannot see, when %s",
        async (scope) => {
          const token = await tokenOfBea(scope);

          const read = await api.app.inject({
            method: "GET",
            url: `/items/${idOf("Ana passport")}`,
            headers: api.machineHeaders(token),
          });
          const write = await rename(token, "Ana passport");
          const writeToNothing = await api.app.inject({
            method: "PATCH",
            url: "/items/never-issued",
            headers: api.machineHeaders(token),
            payload: { name: "Renamed by a token" },
          });

          expect(read.statusCode).toBe(404);
          // A read token's refusal is the same for every id, real or not, so
          // it says nothing about what exists either.
          expect(errorOf(write)).toEqual(errorOf(writeToNothing));
          expect(write.statusCode).toBe(scope === MachineTokenScope.Read ? 403 : 404);
        },
      );
    });
  });
});
