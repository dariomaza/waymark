import {
  GetItem,
  GetStorageUnit,
  GetStorageUnitPath,
  ItemNotFound,
  ListItems,
  ListStorageUnits,
  SearchInventory,
  resolveAccess,
  Role,
  ShareLevel,
  StorageUnitNotFound,
  unitId,
  userId,
  type Access,
  type UnitId,
  type UserId,
} from "@waymark/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AN_OWNER, ANOTHER_OWNER, aPhotoId, aStorageUnit, anItem } from "./builders.js";
import type { InvisibilityContext, RepositoryHarness } from "./harness.js";

/** Ana owns a house; Bea owns a flat. Neither is an administrator. */
const ANA: UserId = AN_OWNER;
const BEA: UserId = ANOTHER_OWNER;
/** Owns nothing. An administrator's reach does not depend on owning. */
const ADMIN: UserId = userId("contract-administrator");

/**
 * The one fixture every read path is held to (ADR 26).
 *
 * Ana's house holds a garage shared with Bea to view, an attic shared with
 * Bea to edit, and a safe shared with nobody. The house itself is not shared,
 * so for Bea the garage and the attic are roots and the house's name must
 * never appear. Bea's flat is hers alone.
 */
const SPACES = {
  house: aStorageUnit("ana-house", { name: "Ana house", ownerId: ANA }),
  garage: aStorageUnit("ana-garage", {
    name: "Ana garage",
    parentId: unitId("ana-house"),
  }),
  shelf: aStorageUnit("ana-shelf", { name: "Ana shelf", parentId: unitId("ana-garage") }),
  attic: aStorageUnit("ana-attic", { name: "Ana attic", parentId: unitId("ana-house") }),
  safe: aStorageUnit("ana-safe", {
    name: "Ana safe",
    parentId: unitId("ana-house"),
    photoId: aPhotoId("photo-of-the-safe"),
  }),
  jewels: aStorageUnit("ana-jewels", {
    name: "Ana jewel box",
    parentId: unitId("ana-safe"),
  }),
  flat: aStorageUnit("bea-flat", { name: "Bea flat", ownerId: BEA }),
  wardrobe: aStorageUnit("bea-wardrobe", {
    name: "Bea wardrobe",
    parentId: unitId("bea-flat"),
  }),
} as const;

const ITEMS = {
  tent: anItem("ana-tent", SPACES.house.id, { name: "Ana tent" }),
  drill: anItem("ana-drill", SPACES.shelf.id, {
    name: "Ana drill",
    photos: [aPhotoId("photo-of-the-drill")],
  }),
  lamp: anItem("ana-lamp", SPACES.attic.id, { name: "Ana lamp" }),
  passport: anItem("ana-passport", SPACES.safe.id, {
    name: "Ana passport",
    photos: [aPhotoId("photo-of-the-passport")],
  }),
  ring: anItem("ana-ring", SPACES.jewels.id, { name: "Ana ring" }),
  scarf: anItem("bea-scarf", SPACES.wardrobe.id, {
    name: "Bea scarf",
    photos: [aPhotoId("photo-of-the-scarf")],
  }),
} as const;

const ANAS_SPACES = ["ana-attic", "ana-garage", "ana-house", "ana-jewels", "ana-safe", "ana-shelf"];
const BEAS_SPACES = ["bea-flat", "bea-wardrobe"];
/** What is shared with Bea, and everything under it. */
const SHARED_WITH_BEA = ["ana-attic", "ana-garage", "ana-shelf"];

/** Every name Bea must never read, wherever an answer might carry it. */
const NAMES_HIDDEN_FROM_BEA = [
  "Ana house",
  "Ana safe",
  "Ana jewel box",
  "Ana tent",
  "Ana passport",
  "Ana ring",
];

/** Every name of Bea's, which Ana must never read. */
const BEAS_NAMES = ["Bea flat", "Bea wardrobe", "Bea scarf"];

const ANAS_ITEMS = ["ana-drill", "ana-lamp", "ana-passport", "ana-ring", "ana-tent"];
/** What Bea may see of Ana's things: what the garage and the attic hold. */
const ANAS_ITEMS_SHARED_WITH_BEA = ["ana-drill", "ana-lamp"];

/** The names an answer carries, wherever in it they are. */
const namesIn = (answer: unknown, among: readonly string[]): string[] => {
  const text = JSON.stringify(answer);

  return among.filter((name) => text.includes(name));
};

const sortedIdsOf = (entities: readonly { readonly id: string }[]): string[] =>
  entities.map((entity) => entity.id).sort();

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

    const accessOf = async (who: UserId, role: Role = Role.USER): Promise<Access> =>
      resolveAccess({
        caller: { userId: who, role },
        storageUnits: await context.storageUnits.findAll(),
        shares: await context.shares.findAll(),
      });

    const asAna = (): Promise<Access> => accessOf(ANA);
    const asBea = (): Promise<Access> => accessOf(BEA);
    const asAdmin = (): Promise<Access> => accessOf(ADMIN, Role.ADMINISTRATOR);

    beforeEach(async () => {
      context = await harness.setUp();
      // Root first, so a relational adapter's parent keys are satisfiable.
      for (const unit of Object.values(SPACES)) {
        await context.storageUnits.save(unit);
      }
      await context.items.saveAll(Object.values(ITEMS));
      await context.shares.set({
        storageUnitId: SPACES.garage.id,
        userId: BEA,
        access: ShareLevel.VIEW,
      });
      await context.shares.set({
        storageUnitId: SPACES.attic.id,
        userId: BEA,
        access: ShareLevel.EDIT,
      });
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
