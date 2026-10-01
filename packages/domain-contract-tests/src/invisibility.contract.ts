import {
  FindPhoto,
  GetItem,
  GetStorageUnit,
  GetStorageUnitPath,
  ItemNotFound,
  ListItems,
  ListStorageUnits,
  ReachablePhotos,
  SearchInventory,
  Role,
  StorageUnitNotFound,
  unitId,
  type Access,
  type UnitId,
  type UserId,
} from "@waymark/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { aPhotoId, anItem } from "./builders.js";
import type { InvisibilityContext, RepositoryHarness } from "./harness.js";
import {
  accessIn,
  ADMIN,
  ANA,
  ANAS_ITEMS,
  ANAS_ITEMS_SHARED_WITH_BEA,
  ANAS_SPACES,
  BEA,
  BEAS_NAMES,
  BEAS_SPACES,
  ITEMS,
  NAMES_HIDDEN_FROM_BEA,
  namesIn,
  PHOTOS,
  SHARED_WITH_BEA,
  seedHousehold,
  sortedIdsOf,
  SPACES,
} from "./invisibility.fixture.js";

/**
 * # Something you may not see does not exist (ADR 26)
 *
 * Every read use case, run against one household, as each of the people in
 * it. The rule is the same everywhere: Bea cannot see Ana's unshared space,
 * nor anything inside it, nor any of its names; Bea sees what was shared and
 * everything under it; Ana sees all of hers and none of Bea's; the
 * administrator sees everything.
 *
 * A new read path is the most dangerous change in this repository. Its place
 * is in this file, against this fixture, before it reaches a route.
 */
export const invisibilityContract = (
  harness: RepositoryHarness<InvisibilityContext>,
): void => {
  describe(`What each person may see (${harness.name})`, () => {
    let context: InvisibilityContext;

    const accessOf = (who: UserId, role: Role = Role.USER): Promise<Access> =>
      accessIn(context, who, role);

    const asAna = (): Promise<Access> => accessOf(ANA);
    const asBea = (): Promise<Access> => accessOf(BEA);
    const asAdmin = (): Promise<Access> => accessOf(ADMIN, Role.ADMINISTRATOR);

    beforeEach(async () => {
      context = await harness.setUp();
      await seedHousehold(context);
    });

    afterEach(async () => {
      await harness.tearDown();
    });

    describe("the tree", () => {
      const tree = async (access: Access) =>
        new ListStorageUnits({ storageUnits: context.storageUnits }).execute(access);

      it("shows Bea what was shared with her and her own, and nothing else of Ana's", async () => {
        const seen = await tree(await asBea());

        expect(sortedIdsOf(seen)).toEqual([...SHARED_WITH_BEA, ...BEAS_SPACES].sort());
        expect(namesIn(seen, NAMES_HIDDEN_FROM_BEA)).toEqual([]);
      });

      it("shows Ana all of her spaces and none of Bea's", async () => {
        const seen = await tree(await asAna());

        expect(sortedIdsOf(seen)).toEqual(ANAS_SPACES);
        expect(namesIn(seen, BEAS_NAMES)).toEqual([]);
      });

      it("shows the administrator every space", async () => {
        expect(sortedIdsOf(await tree(await asAdmin()))).toEqual(
          [...ANAS_SPACES, ...BEAS_SPACES].sort(),
        );
      });
    });

    describe("a single space", () => {
      const open = async (access: Access, id: UnitId) =>
        new GetStorageUnit({
          storageUnits: context.storageUnits,
          items: context.items,
        }).execute(access, id);

      it.each([["ana-house"], ["ana-safe"], ["ana-jewels"]])(
        "does not exist for Bea when it is Ana's and not shared: %s",
        async (id) => {
          await expect(open(await asBea(), unitId(id))).rejects.toBeInstanceOf(
            StorageUnitNotFound,
          );
        },
      );

      it("opens a shared space for Bea, with what it holds, under a breadcrumb that starts at the share", async () => {
        const seen = await open(await asBea(), SPACES.garage.id);

        expect(seen.path.map((unit) => unit.name)).toEqual(["Ana garage"]);
        expect(sortedIdsOf(seen.children)).toEqual(["ana-shelf"]);
        expect(namesIn(seen, NAMES_HIDDEN_FROM_BEA)).toEqual([]);
      });

      it("opens a space deep inside a share with the breadcrumb still cut", async () => {
        const seen = await open(await asBea(), SPACES.shelf.id);

        expect(seen.path.map((unit) => unit.name)).toEqual(["Ana garage", "Ana shelf"]);
        expect(sortedIdsOf(seen.items)).toEqual(["ana-drill"]);
      });

      it("does not exist for Ana when it is Bea's", async () => {
        await expect(open(await asAna(), SPACES.wardrobe.id)).rejects.toBeInstanceOf(
          StorageUnitNotFound,
        );
      });

      it("opens Ana's safe for Ana, with its whole breadcrumb", async () => {
        const seen = await open(await asAna(), SPACES.jewels.id);

        expect(seen.path.map((unit) => unit.name)).toEqual([
          "Ana house",
          "Ana safe",
          "Ana jewel box",
        ]);
        expect(sortedIdsOf(seen.items)).toEqual(["ana-ring"]);
      });

      it("opens anybody's space for the administrator", async () => {
        const seen = await open(await asAdmin(), SPACES.wardrobe.id);

        expect(seen.path.map((unit) => unit.name)).toEqual(["Bea flat", "Bea wardrobe"]);
        expect(sortedIdsOf(seen.items)).toEqual(["bea-scarf"]);
      });
    });

    describe("every item", () => {
      const everything = async (access: Access) =>
        new ListItems({ items: context.items, storageUnits: context.storageUnits }).execute(
          access,
        );

      it("lists for Bea her own and what the shared spaces hold, located from the share down", async () => {
        const rows = await everything(await asBea());

        expect(sortedIdsOf(rows.map((row) => row.item))).toEqual(
          [...ANAS_ITEMS_SHARED_WITH_BEA, "bea-scarf"].sort(),
        );
        const drill = rows.find((row) => row.item.id === ITEMS.drill.id);
        expect(drill?.path.map((unit) => unit.name)).toEqual(["Ana garage", "Ana shelf"]);
        expect(namesIn(rows, NAMES_HIDDEN_FROM_BEA)).toEqual([]);
      });

      it("lists for Ana all of hers and none of Bea's", async () => {
        const rows = await everything(await asAna());

        expect(sortedIdsOf(rows.map((row) => row.item))).toEqual(ANAS_ITEMS);
        expect(namesIn(rows, BEAS_NAMES)).toEqual([]);
      });

      it("lists everything for the administrator", async () => {
        const rows = await everything(await asAdmin());

        expect(sortedIdsOf(rows.map((row) => row.item))).toEqual(
          [...ANAS_ITEMS, "bea-scarf"].sort(),
        );
      });
    });

    describe("a single item", () => {
      const open = async (access: Access, id: string) =>
        new GetItem({ items: context.items, storageUnits: context.storageUnits }).execute(
          access,
          ITEMS[id as keyof typeof ITEMS].id,
        );

      it.each([["tent"], ["passport"], ["ring"]])(
        "does not exist for Bea when Ana keeps it out of reach: %s",
        async (id) => {
          await expect(open(await asBea(), id)).rejects.toBeInstanceOf(ItemNotFound);
        },
      );

      it("opens a shared item for Bea, located from the share down", async () => {
        const seen = await open(await asBea(), "drill");

        expect(seen.path.map((unit) => unit.name)).toEqual(["Ana garage", "Ana shelf"]);
        expect(namesIn(seen, NAMES_HIDDEN_FROM_BEA)).toEqual([]);
      });

      it("does not exist for Ana when it is Bea's", async () => {
        await expect(open(await asAna(), "scarf")).rejects.toBeInstanceOf(ItemNotFound);
      });

      it("opens anything for Ana in her house and for the administrator anywhere", async () => {
        const ring = await open(await asAna(), "ring");
        expect(ring.path.map((unit) => unit.name)).toEqual([
          "Ana house",
          "Ana safe",
          "Ana jewel box",
        ]);

        await expect(open(await asAdmin(), "scarf")).resolves.toMatchObject({
          item: { id: ITEMS.scarf.id },
        });
      });
    });

    describe("search", () => {
      const find = async (
        access: Access,
        query: string,
        options: { readonly withinUnitId?: UnitId; readonly limit?: number } = {},
      ) =>
        new SearchInventory({
          search: context.search,
          storageUnits: context.storageUnits,
        }).execute(access, { query, ...options });

      const idsOf = (answer: Awaited<ReturnType<typeof find>>) => ({
        items: sortedIdsOf(answer.items.map((result) => result.item)),
        storageUnits: sortedIdsOf(answer.storageUnits.map((result) => result.unit)),
      });

      it("finds for Bea only what was shared with her, located from the share down", async () => {
        const answer = await find(await asBea(), "ana");

        expect(idsOf(answer)).toEqual({
          items: ANAS_ITEMS_SHARED_WITH_BEA,
          storageUnits: SHARED_WITH_BEA,
        });
        const drill = answer.items.find((result) => result.item.id === ITEMS.drill.id);
        expect(drill?.path.map((unit) => unit.name)).toEqual(["Ana garage", "Ana shelf"]);
        expect(namesIn(answer, NAMES_HIDDEN_FROM_BEA)).toEqual([]);
      });

      it("finds for Bea within a shared space only what is under it", async () => {
        const answer = await find(await asBea(), "ana", { withinUnitId: SPACES.garage.id });

        expect(idsOf(answer)).toEqual({ items: ["ana-drill"], storageUnits: ["ana-shelf"] });
      });

      it.each([["ana-house"], ["ana-safe"]])(
        "treats %s as a scope that does not exist for Bea",
        async (id) => {
          await expect(
            find(await asBea(), "ana", { withinUnitId: unitId(id) }),
          ).rejects.toBeInstanceOf(StorageUnitNotFound);
        },
      );

      it("never lets Ana's matches fill Bea's limit", async () => {
        await context.items.saveAll([
          anItem("crowd-1", SPACES.safe.id, { name: "Thing a1" }),
          anItem("crowd-2", SPACES.safe.id, { name: "Thing a2" }),
          anItem("crowd-3", SPACES.safe.id, { name: "Thing a3" }),
          anItem("beas-thing", SPACES.wardrobe.id, { name: "Thing z" }),
        ]);

        const answer = await find(await asBea(), "thing", { limit: 1 });

        expect(answer.items.map((result) => result.item.name)).toEqual(["Thing z"]);
      });

      it("finds nothing of Bea's for Ana, and all of hers", async () => {
        expect(idsOf(await find(await asAna(), "bea"))).toEqual({
          items: [],
          storageUnits: [],
        });
        expect(idsOf(await find(await asAna(), "ana"))).toEqual({
          items: ANAS_ITEMS,
          storageUnits: ANAS_SPACES,
        });
      });

      it("finds everything for the administrator, inside any scope", async () => {
        expect(idsOf(await find(await asAdmin(), "bea"))).toEqual({
          items: ["bea-scarf"],
          storageUnits: BEAS_SPACES,
        });
        expect(
          idsOf(await find(await asAdmin(), "ana", { withinUnitId: SPACES.safe.id })),
        ).toEqual({ items: ["ana-passport", "ana-ring"], storageUnits: ["ana-jewels"] });
      });
    });

    describe("photos and their bytes", () => {
      const find = async (access: Access, id: string) =>
        new FindPhoto({
          photos: context.photos,
          items: context.items,
          storageUnits: context.storageUnits,
        }).execute(access, aPhotoId(id));

      const found = async (access: Access): Promise<string[]> => {
        const seen: string[] = [];
        for (const id of PHOTOS) {
          if ((await find(access, id)) !== null) {
            seen.push(id);
          }
        }

        return seen;
      };

      it("shows Bea the photos of what is shared with her and of her own, and no other", async () => {
        expect(await found(await asBea())).toEqual(["photo-of-the-drill", "photo-of-the-scarf"]);
      });

      it("shows Ana the photos of her things and none of Bea's", async () => {
        expect(await found(await asAna())).toEqual([
          "photo-of-the-drill",
          "photo-of-the-passport",
          "photo-of-the-safe",
        ]);
      });

      it("shows the administrator every photo", async () => {
        expect(await found(await asAdmin())).toEqual(PHOTOS);
      });
    });

    describe("the background-removal queue", () => {
      const reach = async (access: Access) =>
        new ReachablePhotos({
          items: context.items,
          storageUnits: context.storageUnits,
        }).execute(access);

      const photoIdsOf = (reached: Awaited<ReturnType<typeof reach>>) =>
        reached.kind === "everywhere" ? "everywhere" : [...reached.photoIds].sort();

      it("covers for Bea only the photos she may see", async () => {
        expect(photoIdsOf(await reach(await asBea()))).toEqual([
          "photo-of-the-drill",
          "photo-of-the-scarf",
        ]);
      });

      it("covers for Ana only hers", async () => {
        expect(photoIdsOf(await reach(await asAna()))).toEqual([
          "photo-of-the-drill",
          "photo-of-the-passport",
          "photo-of-the-safe",
        ]);
      });

      it("covers everything for the administrator", async () => {
        expect(photoIdsOf(await reach(await asAdmin()))).toBe("everywhere");
      });
    });

    describe("a breadcrumb", () => {
      const pathTo = async (access: Access, id: UnitId) =>
        new GetStorageUnitPath({ storageUnits: context.storageUnits }).execute(
          access,
          id,
        );

      it("starts at the shared space for Bea and names nothing above it", async () => {
        const path = await pathTo(await asBea(), SPACES.shelf.id);

        expect(path.map((unit) => unit.name)).toEqual(["Ana garage", "Ana shelf"]);
      });

      it("does not exist for Bea inside Ana's safe", async () => {
        await expect(pathTo(await asBea(), SPACES.jewels.id)).rejects.toBeInstanceOf(
          StorageUnitNotFound,
        );
      });

      it("is whole for Ana and for the administrator", async () => {
        for (const access of [await asAna(), await asAdmin()]) {
          const path = await pathTo(access, SPACES.shelf.id);

          expect(path.map((unit) => unit.name)).toEqual([
            "Ana house",
            "Ana garage",
            "Ana shelf",
          ]);
        }
      });
    });
  });
};
