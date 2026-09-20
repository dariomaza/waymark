import {
  toSearchTerms,
  type ItemRepository,
  type SearchRepository,
  type StorageUnitRepository,
} from "@ariadna/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { A_LATER_MOMENT, aStorageUnit, anItem } from "./builders.js";
import type {
  RepositoryHarness,
  SearchRepositoryContext,
} from "./harness.js";

/**
 * The behaviour EVERY `SearchRepository` owes its callers, whatever finds the
 * rows behind it.
 *
 * This suite matters more than the others. The in-memory implementation reads
 * the same Maps everything else writes to, so it is right by construction; the
 * Prisma one keeps a full-text index beside the tables and has to be told
 * about every write. An index that silently stops tracking a rename is a
 * feature that looks like it works and quietly cannot find a box, which is
 * exactly the failure this product exists to prevent. So the last half of this
 * file is nothing but "and then somebody changed something".
 *
 * Nothing here asserts an ORDER. The port hands back candidates; ranking is
 * `SearchInventory`'s, precisely so the two implementations can be identical
 * where it counts and free where they cannot be.
 */
export const searchRepositoryContract = (
  harness: RepositoryHarness<SearchRepositoryContext>,
): void => {
  describe(`SearchRepository contract (${harness.name})`, () => {
    let search: SearchRepository;
    let items: ItemRepository;
    let storageUnits: StorageUnitRepository;

    const box = aStorageUnit("box", { name: "Box 3" });
    const crate = aStorageUnit("crate", { name: "Wooden crate" });

    beforeEach(async () => {
      const context = await harness.setUp();
      search = context.search;
      items = context.items;
      storageUnits = context.storageUnits;
      await storageUnits.saveAll([box, crate]);
    });

    afterEach(async () => {
      await harness.tearDown();
    });

    const itemNamesFor = async (query: string): Promise<string[]> =>
      (await search.findItemsMatching(toSearchTerms(query)))
        .map((item) => item.name)
        .sort();

    const unitNamesFor = async (query: string): Promise<string[]> =>
      (await search.findStorageUnitsMatching(toSearchTerms(query)))
        .map((unit) => unit.name)
        .sort();

    describe("findItemsMatching", () => {
      it("answers nothing when there are no terms", async () => {
        await items.save(anItem("drill", box.id, { name: "Cordless drill" }));

        await expect(search.findItemsMatching([])).resolves.toEqual([]);
      });

      it("answers nothing when nothing matches", async () => {
        await items.save(anItem("drill", box.id, { name: "Cordless drill" }));

        await expect(itemNamesFor("submarino")).resolves.toEqual([]);
      });

      it("finds an item by a word in its name", async () => {
        await items.save(anItem("drill", box.id, { name: "Cordless drill" }));

        await expect(itemNamesFor("drill")).resolves.toEqual(["Cordless drill"]);
      });

      it("finds an item by a tag that appears nowhere in its name", async () => {
        await items.save(
          anItem("hdmi", box.id, { name: "HDMI 2.1", tags: ["cables", "video"] }),
        );

        await expect(itemNamesFor("cables")).resolves.toEqual(["HDMI 2.1"]);
      });

      it("finds an item by a word in its description", async () => {
        await items.save(
          anItem("box", box.id, {
            name: "Caja azul",
            description: "Tornillos y tacos surtidos",
          }),
        );

        await expect(itemNamesFor("tornillos")).resolves.toEqual(["Caja azul"]);
      });

      it("returns the whole item, not a projection of it", async () => {
        const drill = anItem("drill", box.id, {
          name: "Cordless drill",
          description: "18V, two batteries",
          quantity: 2,
          tags: ["herramientas"],
        });
        await items.save(drill);

        await expect(
          search.findItemsMatching(toSearchTerms("drill")),
        ).resolves.toEqual([drill]);
      });

      it("finds an accented name from a query without the accent", async () => {
        await items.save(anItem("camera", box.id, { name: "Cámara réflex" }));
        await items.save(anItem("battery", box.id, { name: "Batería de coche" }));

        await expect(itemNamesFor("camara")).resolves.toEqual(["Cámara réflex"]);
        await expect(itemNamesFor("bateria")).resolves.toEqual(["Batería de coche"]);
      });

      it("finds an unaccented name from a query that has the accent", async () => {
        await items.save(anItem("camera", box.id, { name: "Camara compacta" }));
        await items.save(anItem("battery", box.id, { name: "Bateria externa" }));

        await expect(itemNamesFor("cámara")).resolves.toEqual(["Camara compacta"]);
        await expect(itemNamesFor("batería")).resolves.toEqual(["Bateria externa"]);
      });

      it("folds the accents on a tag and on a description too", async () => {
        await items.save(
          anItem("tripod", box.id, {
            name: "Trípode",
            tags: ["fotografía"],
            description: "Para la cámara réflex",
          }),
        );

        await expect(itemNamesFor("fotografia")).resolves.toEqual(["Trípode"]);
        await expect(itemNamesFor("camara")).resolves.toEqual(["Trípode"]);
      });

      it("finds a word from the start of it", async () => {
        await items.save(anItem("cables", box.id, { name: "Cables de red" }));

        await expect(itemNamesFor("cab")).resolves.toEqual(["Cables de red"]);
      });

      it("finds a tag from the start of it", async () => {
        await items.save(
          anItem("hdmi", box.id, { name: "HDMI 2.1", tags: ["cables"] }),
        );

        await expect(itemNamesFor("cab")).resolves.toEqual(["HDMI 2.1"]);
      });

      it("does not match a term longer than the word it is looking at", async () => {
        await items.save(anItem("cab", box.id, { name: "Cab" }));

        await expect(itemNamesFor("cables")).resolves.toEqual([]);
      });

      it("needs every term, not just one of them", async () => {
        await items.save(anItem("cable", box.id, { name: "Cable HDMI" }));

        await expect(itemNamesFor("cable hdmi")).resolves.toEqual(["Cable HDMI"]);
        await expect(itemNamesFor("cable usb")).resolves.toEqual([]);
      });

      it("accepts terms that are spread across name, tags and description", async () => {
        await items.save(
          anItem("hdmi", box.id, {
            name: "Cable HDMI",
            tags: ["video"],
            description: "Del proyector",
          }),
        );

        await expect(itemNamesFor("cable video proyector")).resolves.toEqual([
          "Cable HDMI",
        ]);
      });

      it("finds every item that matches, not merely the first", async () => {
        await items.save(anItem("a", box.id, { name: "Drill A" }));
        await items.save(anItem("b", crate.id, { name: "Drill B" }));

        await expect(itemNamesFor("drill")).resolves.toEqual(["Drill A", "Drill B"]);
      });
    });

    describe("findStorageUnitsMatching", () => {
      it("answers nothing when there are no terms", async () => {
        await expect(search.findStorageUnitsMatching([])).resolves.toEqual([]);
      });

      it("finds a unit by a word in its name", async () => {
        await expect(unitNamesFor("crate")).resolves.toEqual(["Wooden crate"]);
      });

      it("returns the whole unit, not a projection of it", async () => {
        await expect(
          search.findStorageUnitsMatching(toSearchTerms("wooden")),
        ).resolves.toEqual([crate]);
      });

      it("finds an accented unit name from a query without the accent", async () => {
        const wardrobe = aStorageUnit("wardrobe", { name: "Armario metálico" });
        await storageUnits.save(wardrobe);

        await expect(unitNamesFor("metalico")).resolves.toEqual(["Armario metálico"]);
      });

      it("finds an unaccented unit name from a query that has the accent", async () => {
        const wardrobe = aStorageUnit("wardrobe", { name: "Armario metalico" });
        await storageUnits.save(wardrobe);

        await expect(unitNamesFor("metálico")).resolves.toEqual(["Armario metalico"]);
      });

      it("finds a unit name from the start of it", async () => {
        await expect(unitNamesFor("woo")).resolves.toEqual(["Wooden crate"]);
      });

      it("does not find a unit by its description", async () => {
        await storageUnits.save(
          aStorageUnit("shelf", {
            name: "Top shelf",
            description: "Herramientas de jardín",
          }),
        );

        await expect(unitNamesFor("jardin")).resolves.toEqual([]);
      });

      it("never answers with an item", async () => {
        await items.save(anItem("crate", box.id, { name: "Wooden crate" }));

        await expect(unitNamesFor("crate")).resolves.toEqual(["Wooden crate"]);
      });
    });

    describe("staying right while the inventory changes", () => {
      it("forgets an item's old name and knows its new one", async () => {
        const drill = anItem("drill", box.id, { name: "Cordless drill" });
        await items.save(drill);

        await items.save({
          ...drill,
          name: "Angle grinder",
          updatedAt: A_LATER_MOMENT,
        });

        await expect(itemNamesFor("drill")).resolves.toEqual([]);
        await expect(itemNamesFor("grinder")).resolves.toEqual(["Angle grinder"]);
      });

      it("forgets a tag that was taken off an item and knows the one that replaced it", async () => {
        const hdmi = anItem("hdmi", box.id, {
          name: "HDMI 2.1",
          tags: ["cables"],
        });
        await items.save(hdmi);

        await items.save({ ...hdmi, tags: ["video"], updatedAt: A_LATER_MOMENT });

        await expect(itemNamesFor("cables")).resolves.toEqual([]);
        await expect(itemNamesFor("video")).resolves.toEqual(["HDMI 2.1"]);
      });

      it("knows a tag that was added to an item that had none", async () => {
        const hdmi = anItem("hdmi", box.id, { name: "HDMI 2.1" });
        await items.save(hdmi);

        await items.save({
          ...hdmi,
          tags: ["cables"],
          updatedAt: A_LATER_MOMENT,
        });

        await expect(itemNamesFor("cables")).resolves.toEqual(["HDMI 2.1"]);
      });

      it("forgets every tag when an item is stripped of all of them", async () => {
        const hdmi = anItem("hdmi", box.id, {
          name: "HDMI 2.1",
          tags: ["cables", "video"],
        });
        await items.save(hdmi);

        await items.save({ ...hdmi, tags: [], updatedAt: A_LATER_MOMENT });

        await expect(itemNamesFor("cables")).resolves.toEqual([]);
        await expect(itemNamesFor("video")).resolves.toEqual([]);
      });

      it("forgets an item's old description and knows its new one", async () => {
        const item = anItem("box", box.id, {
          name: "Caja",
          description: "Tornillos surtidos",
        });
        await items.save(item);

        await items.save({
          ...item,
          description: "Tuercas surtidas",
          updatedAt: A_LATER_MOMENT,
        });

        await expect(itemNamesFor("tornillos")).resolves.toEqual([]);
        await expect(itemNamesFor("tuercas")).resolves.toEqual(["Caja"]);
      });

      it("forgets a description that was cleared", async () => {
        const item = anItem("box", box.id, {
          name: "Caja",
          description: "Tornillos surtidos",
        });
        await items.save(item);

        await items.save({
          ...item,
          description: null,
          updatedAt: A_LATER_MOMENT,
        });

        await expect(itemNamesFor("tornillos")).resolves.toEqual([]);
        await expect(itemNamesFor("caja")).resolves.toEqual(["Caja"]);
      });

      it("still finds an item after it has been moved, and says where it is now", async () => {
        const drill = anItem("drill", box.id, { name: "Cordless drill" });
        await items.save(drill);

        await items.save({
          ...drill,
          storageUnitId: crate.id,
          updatedAt: A_LATER_MOMENT,
        });

        const [found] = await search.findItemsMatching(toSearchTerms("drill"));
        expect(found?.storageUnitId).toBe(crate.id);
      });

      it("keeps a bulk move searchable, every item of it", async () => {
        const first = anItem("first", box.id, { name: "Drill A" });
        const second = anItem("second", box.id, { name: "Drill B" });
        await items.saveAll([first, second]);

        await items.saveAll([
          { ...first, storageUnitId: crate.id, updatedAt: A_LATER_MOMENT },
          { ...second, storageUnitId: crate.id, updatedAt: A_LATER_MOMENT },
        ]);

        await expect(itemNamesFor("drill")).resolves.toEqual(["Drill A", "Drill B"]);
      });

      it("forgets an item that was deleted", async () => {
        const drill = anItem("drill", box.id, { name: "Cordless drill" });
        await items.save(drill);

        await items.delete(drill.id);

        await expect(itemNamesFor("drill")).resolves.toEqual([]);
      });

      it("forgets the tags of an item that was deleted", async () => {
        const hdmi = anItem("hdmi", box.id, {
          name: "HDMI 2.1",
          tags: ["cables"],
        });
        await items.save(hdmi);

        await items.delete(hdmi.id);

        await expect(itemNamesFor("cables")).resolves.toEqual([]);
      });

      it("forgets a unit's old name and knows its new one", async () => {
        await storageUnits.save({
          ...crate,
          name: "Plastic bin",
          updatedAt: A_LATER_MOMENT,
        });

        await expect(unitNamesFor("wooden")).resolves.toEqual([]);
        await expect(unitNamesFor("plastic")).resolves.toEqual(["Plastic bin"]);
      });

      it("still finds a unit after it has been moved under another one", async () => {
        await storageUnits.save({
          ...crate,
          parentId: box.id,
          updatedAt: A_LATER_MOMENT,
        });

        await expect(unitNamesFor("wooden")).resolves.toEqual(["Wooden crate"]);
      });

      it("forgets a unit that was deleted", async () => {
        await storageUnits.delete(crate.id);

        await expect(unitNamesFor("wooden")).resolves.toEqual([]);
      });

      it("does not confuse two items that were saved in the same batch", async () => {
        await items.saveAll([
          anItem("a", box.id, { name: "Taladro", tags: ["herramientas"] }),
          anItem("b", box.id, { name: "Destornillador", tags: ["tornillos"] }),
        ]);

        await expect(itemNamesFor("herramientas")).resolves.toEqual(["Taladro"]);
        await expect(itemNamesFor("tornillos")).resolves.toEqual(["Destornillador"]);
      });
    });
  });
};
