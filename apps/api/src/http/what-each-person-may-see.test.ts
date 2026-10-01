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
});
