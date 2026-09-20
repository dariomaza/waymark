import {
  coverPhotoId,
  itemId,
  moveItemTo,
  unitId,
  type ItemRepository,
  type StorageUnitRepository,
} from "@ariadna/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  A_LATER_MOMENT,
  aPhotoId,
  aStorageUnit,
  anItem,
  sortedIds,
} from "./builders.js";
import type {
  ItemRepositoryContext,
  RepositoryHarness,
} from "./harness.js";

/**
 * The behaviour EVERY `ItemRepository` owes its callers. Run once against the
 * in-memory repository the domain is tested with, once against Prisma.
 */
export const itemRepositoryContract = (
  harness: RepositoryHarness<ItemRepositoryContext>,
): void => {
  describe(`ItemRepository contract (${harness.name})`, () => {
    let items: ItemRepository;
    let storageUnits: StorageUnitRepository;

    const box = aStorageUnit("box");
    const crate = aStorageUnit("crate");

    beforeEach(async () => {
      const context = await harness.setUp();
      items = context.items;
      storageUnits = context.storageUnits;
      await storageUnits.saveAll([box, crate]);
    });

    afterEach(async () => {
      await harness.tearDown();
    });

    describe("findById", () => {
      it("returns null for an id nobody stored", async () => {
        await expect(items.findById(itemId("ghost"))).resolves.toBeNull();
      });

      it("returns a saved item field for field", async () => {
        const drill = anItem("drill", box.id, {
          name: "Cordless drill",
          description: "18V, two batteries",
          quantity: 1,
        });

        await items.save(drill);

        await expect(items.findById(drill.id)).resolves.toEqual(drill);
      });

      it("round-trips a null description and a quantity of one", async () => {
        const item = anItem("item", box.id);

        await items.save(item);
        const found = await items.findById(item.id);

        expect(found?.description).toBeNull();
        expect(found?.quantity).toBe(1);
      });

      it("round-trips a quantity greater than one", async () => {
        const item = anItem("screws", box.id, { quantity: 250 });

        await items.save(item);

        await expect(items.findById(item.id)).resolves.toEqual(item);
      });

      it("keeps timestamps to the millisecond", async () => {
        const item = anItem("item", box.id);

        await items.save(item);
        const found = await items.findById(item.id);

        expect(found?.createdAt.toISOString()).toBe(item.createdAt.toISOString());
        expect(found?.updatedAt.toISOString()).toBe(item.updatedAt.toISOString());
      });
    });

    describe("tags", () => {
      it("round-trips tags in the order they were given", async () => {
        const item = anItem("item", box.id, {
          tags: ["winter", "clothes", "attic"],
        });

        await items.save(item);
        const found = await items.findById(item.id);

        expect(found?.tags).toEqual(["winter", "clothes", "attic"]);
      });

      it("round-trips an empty tag list", async () => {
        const item = anItem("item", box.id, { tags: [] });

        await items.save(item);

        await expect(items.findById(item.id)).resolves.toEqual(item);
      });

      it("keeps a repeated tag instead of collapsing it", async () => {
        const item = anItem("item", box.id, { tags: ["tools", "tools"] });

        await items.save(item);
        const found = await items.findById(item.id);

        expect(found?.tags).toEqual(["tools", "tools"]);
      });

      it("replaces the tag list on save instead of appending to it", async () => {
        const item = anItem("item", box.id, { tags: ["a", "b", "c"] });
        await items.save(item);

        await items.save({ ...item, tags: ["z"], updatedAt: A_LATER_MOMENT });
        const found = await items.findById(item.id);

        expect(found?.tags).toEqual(["z"]);
      });

      it("clears the tag list when it is saved empty", async () => {
        const item = anItem("item", box.id, { tags: ["a", "b"] });
        await items.save(item);

        await items.save({ ...item, tags: [], updatedAt: A_LATER_MOMENT });
        const found = await items.findById(item.id);

        expect(found?.tags).toEqual([]);
      });
    });

    describe("photos", () => {
      // The ids are deliberately NOT in alphabetical order: an implementation
      // that leans on whatever order its storage happens to return, instead of
      // ordering explicitly, has to be caught here rather than in production
      // the first time a query planner changes its mind.
      it("round-trips photos in order, cover first", async () => {
        const item = anItem("item", box.id, {
          photos: [aPhotoId("zulu"), aPhotoId("alpha"), aPhotoId("mike")],
        });

        await items.save(item);
        const found = await items.findById(item.id);

        expect(found?.photos).toEqual(["zulu", "alpha", "mike"]);
        expect(coverPhotoId(found!)).toBe("zulu");
      });

      it("round-trips an empty photo list with no cover", async () => {
        const item = anItem("item", box.id, { photos: [] });

        await items.save(item);
        const found = await items.findById(item.id);

        expect(found?.photos).toEqual([]);
        expect(coverPhotoId(found!)).toBeNull();
      });

      it("reorders the photos when the cover changes", async () => {
        const first = aPhotoId("first");
        const second = aPhotoId("second");
        const item = anItem("item", box.id, { photos: [first, second] });
        await items.save(item);

        await items.save({
          ...item,
          photos: [second, first],
          updatedAt: A_LATER_MOMENT,
        });
        const found = await items.findById(item.id);

        expect(found?.photos).toEqual(["second", "first"]);
      });

      it("replaces the photo list on save instead of appending to it", async () => {
        const item = anItem("item", box.id, {
          photos: [aPhotoId("a"), aPhotoId("b"), aPhotoId("c")],
        });
        await items.save(item);

        await items.save({
          ...item,
          photos: [aPhotoId("d")],
          updatedAt: A_LATER_MOMENT,
        });
        const found = await items.findById(item.id);

        expect(found?.photos).toEqual(["d"]);
      });
    });

    describe("save", () => {
      it("replaces an existing item instead of storing it twice", async () => {
        const item = anItem("item", box.id, { name: "Old name" });
        await items.save(item);

        const renamed = { ...item, name: "New name", updatedAt: A_LATER_MOMENT };
        await items.save(renamed);

        await expect(items.findById(item.id)).resolves.toEqual(renamed);
        await expect(items.countByStorageUnit(box.id)).resolves.toBe(1);
      });

      it("moves an item to another storage unit", async () => {
        const item = anItem("item", box.id);
        await items.save(item);

        await items.save(moveItemTo(item, crate.id, A_LATER_MOMENT));

        await expect(items.findByStorageUnit(box.id)).resolves.toEqual([]);
        expect(sortedIds(await items.findByStorageUnit(crate.id))).toEqual([
          "item",
        ]);
      });
    });

    describe("saveAll", () => {
      it("persists every item of the batch", async () => {
        const batch = [
          anItem("a", box.id, { tags: ["x"] }),
          anItem("b", box.id, { photos: [aPhotoId("p")] }),
          anItem("c", crate.id),
        ];

        await items.saveAll(batch);

        for (const item of batch) {
          await expect(items.findById(item.id)).resolves.toEqual(item);
        }
      });

      it("accepts an empty batch without complaining", async () => {
        await expect(items.saveAll([])).resolves.toBeUndefined();
      });
    });

    describe("delete", () => {
      it("removes the item", async () => {
        const item = anItem("item", box.id, {
          tags: ["a"],
          photos: [aPhotoId("p")],
        });
        await items.save(item);

        await items.delete(item.id);

        await expect(items.findById(item.id)).resolves.toBeNull();
        await expect(items.countByStorageUnit(box.id)).resolves.toBe(0);
      });

      it("treats deleting an unknown id as a no-op", async () => {
        await expect(items.delete(itemId("ghost"))).resolves.toBeUndefined();
      });

      it("leaves the other items alone", async () => {
        const doomed = anItem("doomed", box.id);
        const survivor = anItem("survivor", box.id, { tags: ["keep"] });
        await items.saveAll([doomed, survivor]);

        await items.delete(doomed.id);

        await expect(items.findById(survivor.id)).resolves.toEqual(survivor);
      });
    });

    describe("findManyByIds", () => {
      it("returns only the ids that exist", async () => {
        const known = anItem("known", box.id);
        await items.save(known);

        const found = await items.findManyByIds([known.id, itemId("ghost")]);

        expect(sortedIds(found)).toEqual(["known"]);
      });

      it("returns the items in the order they were asked for", async () => {
        const batch = [
          anItem("a", box.id),
          anItem("b", box.id),
          anItem("c", box.id),
        ];
        await items.saveAll(batch);

        const found = await items.findManyByIds([
          itemId("c"),
          itemId("a"),
          itemId("b"),
        ]);

        expect(found.map((item) => item.id)).toEqual(["c", "a", "b"]);
      });

      it("returns an item once per time it was asked for", async () => {
        const item = anItem("item", box.id);
        await items.save(item);

        const found = await items.findManyByIds([item.id, item.id]);

        expect(found.map((each) => each.id)).toEqual(["item", "item"]);
      });

      it("returns an empty list for an empty request", async () => {
        await expect(items.findManyByIds([])).resolves.toEqual([]);
      });
    });

    describe("findByStorageUnit", () => {
      it("returns only the items of that unit", async () => {
        await items.saveAll([
          anItem("a", box.id),
          anItem("b", box.id),
          anItem("c", crate.id),
        ]);

        expect(sortedIds(await items.findByStorageUnit(box.id))).toEqual([
          "a",
          "b",
        ]);
      });

      it("returns items field for field", async () => {
        const item = anItem("item", box.id, {
          tags: ["tools"],
          photos: [aPhotoId("p1"), aPhotoId("p2")],
          quantity: 3,
        });
        await items.save(item);

        await expect(items.findByStorageUnit(box.id)).resolves.toEqual([item]);
      });

      it("returns an empty list for an empty unit", async () => {
        await expect(items.findByStorageUnit(crate.id)).resolves.toEqual([]);
      });

      it("returns an empty list for an unknown unit", async () => {
        await expect(
          items.findByStorageUnit(unitId("ghost")),
        ).resolves.toEqual([]);
      });
    });

    describe("countByStorageUnit", () => {
      it("counts only the items of that unit", async () => {
        await items.saveAll([
          anItem("a", box.id),
          anItem("b", box.id),
          anItem("c", crate.id),
        ]);

        await expect(items.countByStorageUnit(box.id)).resolves.toBe(2);
        await expect(items.countByStorageUnit(crate.id)).resolves.toBe(1);
      });

      it("returns zero for an empty unit", async () => {
        await expect(items.countByStorageUnit(box.id)).resolves.toBe(0);
      });

      it("returns zero for an unknown unit", async () => {
        await expect(
          items.countByStorageUnit(unitId("ghost")),
        ).resolves.toBe(0);
      });
    });
  });
};
