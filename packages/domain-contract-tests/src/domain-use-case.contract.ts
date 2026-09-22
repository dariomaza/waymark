import {
  CreateItem,
  CreateStorageUnit,
  CyclicStorageUnitMove,
  DeleteItem,
  DeleteStorageUnit,
  EmptyStorageUnit,
  formatStorageUnitPath,
  GetStorageUnitPath,
  InvalidQuantity,
  ItemNotFound,
  ListItems,
  MoveItems,
  MoveStorageUnit,
  StorageUnitKind,
  StorageUnitNotEmpty,
  StorageUnitNotFound,
  UpdateItem,
  UpdateStorageUnit,
  itemId,
  unitId,
  type ItemRepository,
  type StorageUnit,
  type StorageUnitRepository,
} from "@waymark/domain";
import {
  FakeClock,
  SequentialIdGenerator,
  SequentialPublicIdGenerator,
} from "@waymark/domain/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { A_MOMENT, aPhotoId, sortedIds } from "./builders.js";
import type {
  DomainUseCaseContext,
  RepositoryHarness,
} from "./harness.js";

/**
 * The domain rules, re-run end to end through whichever repositories the
 * harness supplies.
 *
 * `packages/domain` already proves these against the in-memory repositories.
 * Running the SAME cases against a real database is what turns "the adapter
 * implements the interface" into "the adapter implements the behaviour": a
 * missing index, a lost ordering or a silently swallowed write breaks an ADR
 * here, not six months later in production.
 */
export const domainUseCaseContract = (
  harness: RepositoryHarness<DomainUseCaseContext>,
): void => {
  describe(`Domain use cases over the repositories (${harness.name})`, () => {
    let storageUnits: StorageUnitRepository;
    let items: ItemRepository;
    let clock: FakeClock;
    let createStorageUnit: CreateStorageUnit;
    let moveStorageUnit: MoveStorageUnit;
    let deleteStorageUnit: DeleteStorageUnit;
    let emptyStorageUnit: EmptyStorageUnit;
    let getStorageUnitPath: GetStorageUnitPath;
    let createItem: CreateItem;
    let moveItems: MoveItems;
    let listItems: ListItems;
    let updateStorageUnit: UpdateStorageUnit;
    let updateItem: UpdateItem;
    let deleteItem: DeleteItem;

    const aUnit = async (
      name: string,
      parentId?: StorageUnit["parentId"],
    ): Promise<StorageUnit> =>
      createStorageUnit.execute({
        name,
        kind: StorageUnitKind.BOX,
        parentId: parentId ?? null,
      });

    beforeEach(async () => {
      const context = await harness.setUp();
      storageUnits = context.storageUnits;
      items = context.items;
      clock = new FakeClock(A_MOMENT);

      createStorageUnit = new CreateStorageUnit({
        storageUnits,
        ids: new SequentialIdGenerator("unit"),
        publicIds: new SequentialPublicIdGenerator(),
        clock,
      });
      moveStorageUnit = new MoveStorageUnit({ storageUnits, clock });
      deleteStorageUnit = new DeleteStorageUnit({ storageUnits, items });
      emptyStorageUnit = new EmptyStorageUnit({ storageUnits, items, clock });
      getStorageUnitPath = new GetStorageUnitPath({ storageUnits });
      createItem = new CreateItem({
        items,
        storageUnits,
        ids: new SequentialIdGenerator("item"),
        clock,
      });
      moveItems = new MoveItems({ items, storageUnits, clock });
      listItems = new ListItems({ items, storageUnits });
      updateStorageUnit = new UpdateStorageUnit({ storageUnits, clock });
      updateItem = new UpdateItem({ items, clock });
      deleteItem = new DeleteItem({ items });
    });

    afterEach(async () => {
      await harness.tearDown();
    });

    describe("ADR 1 — storage units form a recursive tree", () => {
      it("stores a root unit and finds it again", async () => {
        const room = await aUnit("Storage room");

        expect(room.parentId).toBeNull();
        await expect(storageUnits.findById(room.id)).resolves.toEqual(room);
      });

      it("refuses to create a unit under a parent that does not exist", async () => {
        await expect(
          createStorageUnit.execute({
            name: "Orphan",
            kind: StorageUnitKind.BOX,
            parentId: unitId("ghost"),
          }),
        ).rejects.toBeInstanceOf(StorageUnitNotFound);
      });

      it("computes the location as the path to the root", async () => {
        const room = await aUnit("Storage room");
        const wardrobe = await aUnit("Metal wardrobe", room.id);
        const box = await aUnit("Box 3", wardrobe.id);

        const path = await getStorageUnitPath.execute(box.id);

        expect(formatStorageUnitPath(path)).toBe(
          "Storage room > Metal wardrobe > Box 3",
        );
      });

      it("carries the whole subtree along when a unit moves", async () => {
        const room = await aUnit("Storage room");
        const garage = await aUnit("Garage");
        const wardrobe = await aUnit("Metal wardrobe", room.id);
        const box = await aUnit("Box 3", wardrobe.id);

        await moveStorageUnit.execute({
          id: wardrobe.id,
          targetParentId: garage.id,
        });

        const path = await getStorageUnitPath.execute(box.id);
        expect(formatStorageUnitPath(path)).toBe(
          "Garage > Metal wardrobe > Box 3",
        );
      });
    });

    describe("ADR 2 — move validation rejects the whole subtree", () => {
      it("rejects a unit being moved into itself", async () => {
        const room = await aUnit("Storage room");

        await expect(
          moveStorageUnit.execute({ id: room.id, targetParentId: room.id }),
        ).rejects.toBeInstanceOf(CyclicStorageUnitMove);
      });

      it("rejects a unit being moved into its direct child", async () => {
        const room = await aUnit("Storage room");
        const wardrobe = await aUnit("Metal wardrobe", room.id);

        await expect(
          moveStorageUnit.execute({ id: room.id, targetParentId: wardrobe.id }),
        ).rejects.toBeInstanceOf(CyclicStorageUnitMove);
      });

      /**
       * The case the naive `parentId !== id` guard waves through, and the whole
       * reason `findAncestors` exists. See ADR 2.
       */
      it("rejects the three-node cycle the direct-parent guard misses", async () => {
        const room = await aUnit("Storage room");
        const wardrobe = await aUnit("Metal wardrobe", room.id);
        const box = await aUnit("Box 3", wardrobe.id);

        await expect(
          moveStorageUnit.execute({ id: room.id, targetParentId: box.id }),
        ).rejects.toBeInstanceOf(CyclicStorageUnitMove);
      });

      it("leaves the tree untouched after a rejected move", async () => {
        const room = await aUnit("Storage room");
        const wardrobe = await aUnit("Metal wardrobe", room.id);
        const box = await aUnit("Box 3", wardrobe.id);

        await expect(
          moveStorageUnit.execute({ id: room.id, targetParentId: box.id }),
        ).rejects.toBeInstanceOf(CyclicStorageUnitMove);

        const stillThere = await storageUnits.findById(room.id);
        expect(stillThere?.parentId).toBeNull();
        await expect(getStorageUnitPath.execute(box.id)).resolves.toHaveLength(
          3,
        );
      });

      it("always allows moving a unit out to the root", async () => {
        const room = await aUnit("Storage room");
        const wardrobe = await aUnit("Metal wardrobe", room.id);

        const moved = await moveStorageUnit.execute({
          id: wardrobe.id,
          targetParentId: null,
        });

        expect(moved.parentId).toBeNull();
        await expect(storageUnits.findAncestors(wardrobe.id)).resolves.toEqual(
          [],
        );
      });

      it("rejects a move onto a parent that does not exist", async () => {
        const room = await aUnit("Storage room");

        await expect(
          moveStorageUnit.execute({
            id: room.id,
            targetParentId: unitId("ghost"),
          }),
        ).rejects.toBeInstanceOf(StorageUnitNotFound);
      });
    });

    describe("ADR 3 — deleting a storage unit requires it to be empty", () => {
      it("refuses to delete a unit that still holds an item", async () => {
        const box = await aUnit("Box 3");
        await createItem.execute({ storageUnitId: box.id, name: "Drill" });

        await expect(deleteStorageUnit.execute(box.id)).rejects.toBeInstanceOf(
          StorageUnitNotEmpty,
        );
        await expect(storageUnits.findById(box.id)).resolves.not.toBeNull();
      });

      it("refuses to delete a unit that still holds a child unit", async () => {
        const wardrobe = await aUnit("Metal wardrobe");
        await aUnit("Box 3", wardrobe.id);

        await expect(
          deleteStorageUnit.execute(wardrobe.id),
        ).rejects.toBeInstanceOf(StorageUnitNotEmpty);
      });

      it("reports both counts so the UI can offer emptying", async () => {
        const wardrobe = await aUnit("Metal wardrobe");
        await aUnit("Box 3", wardrobe.id);
        await aUnit("Box 4", wardrobe.id);
        await createItem.execute({
          storageUnitId: wardrobe.id,
          name: "Loose screwdriver",
        });

        const failure = await deleteStorageUnit
          .execute(wardrobe.id)
          .catch((error: unknown) => error);

        expect(failure).toBeInstanceOf(StorageUnitNotEmpty);
        expect((failure as StorageUnitNotEmpty).itemCount).toBe(1);
        expect((failure as StorageUnitNotEmpty).childUnitCount).toBe(2);
      });

      it("deletes a unit that is genuinely empty", async () => {
        const box = await aUnit("Box 3");

        await deleteStorageUnit.execute(box.id);

        await expect(storageUnits.findById(box.id)).resolves.toBeNull();
      });

      it("never cascades: emptying then deleting keeps the contents alive", async () => {
        const room = await aUnit("Storage room");
        const wardrobe = await aUnit("Metal wardrobe", room.id);
        const box = await aUnit("Box 3", wardrobe.id);
        const drill = await createItem.execute({
          storageUnitId: wardrobe.id,
          name: "Drill",
        });

        clock.advanceBy(60_000);
        await emptyStorageUnit.execute(wardrobe.id);
        await deleteStorageUnit.execute(wardrobe.id);

        await expect(storageUnits.findById(wardrobe.id)).resolves.toBeNull();
        expect((await storageUnits.findById(box.id))?.parentId).toBe(room.id);
        expect((await items.findById(drill.id))?.storageUnitId).toBe(room.id);
      });

      it("moves a batch of items in one go", async () => {
        const box = await aUnit("Box 3");
        const crate = await aUnit("Crate");
        const first = await createItem.execute({
          storageUnitId: box.id,
          name: "Drill",
        });
        const second = await createItem.execute({
          storageUnitId: box.id,
          name: "Sander",
        });

        clock.advanceBy(1_000);
        await moveItems.execute({
          itemIds: [first.id, second.id],
          targetUnitId: crate.id,
        });

        expect(sortedIds(await items.findByStorageUnit(crate.id))).toEqual([
          first.id,
          second.id,
        ]);
        await expect(items.findByStorageUnit(box.id)).resolves.toEqual([]);
      });

      it("rejects the whole batch when one item is unknown", async () => {
        const box = await aUnit("Box 3");
        const crate = await aUnit("Crate");
        const known = await createItem.execute({
          storageUnitId: box.id,
          name: "Drill",
        });

        await expect(
          moveItems.execute({
            itemIds: [known.id, itemId("ghost")],
            targetUnitId: crate.id,
          }),
        ).rejects.toBeInstanceOf(ItemNotFound);
        expect((await items.findById(known.id))?.storageUnitId).toBe(box.id);
      });

      it("deletes an item unconditionally and reports its released photos", async () => {
        const box = await aUnit("Box 3");
        const item = await createItem.execute({
          storageUnitId: box.id,
          name: "Drill",
          photos: [aPhotoId("photo-1"), aPhotoId("photo-2")],
        });

        const result = await deleteItem.execute(item.id);

        expect(result.releasedPhotoIds).toEqual(["photo-1", "photo-2"]);
        await expect(items.findById(item.id)).resolves.toBeNull();
      });

      it("refuses to create an item in a unit that does not exist", async () => {
        await expect(
          createItem.execute({
            storageUnitId: unitId("ghost"),
            name: "Drill",
          }),
        ).rejects.toBeInstanceOf(StorageUnitNotFound);
      });
    });

    describe("everything you own, in one read", () => {
      it("lists every item with the breadcrumb that says where it is", async () => {
        const garage = await aUnit("Garage");
        const wardrobe = await aUnit("Metal wardrobe", garage.id);
        const box = await aUnit("Box 3", wardrobe.id);
        const kitchen = await aUnit("Kitchen");
        await createItem.execute({ storageUnitId: box.id, name: "Cordless drill" });
        await createItem.execute({ storageUnitId: kitchen.id, name: "Whisk" });

        const rows = await listItems.execute();

        expect(
          rows.map(
            (row) => `${row.item.name} @ ${formatStorageUnitPath(row.path)}`,
          ),
        ).toEqual([
          "Cordless drill @ Garage > Metal wardrobe > Box 3",
          "Whisk @ Kitchen",
        ]);
      });

      it("follows a moved item to its new location", async () => {
        const garage = await aUnit("Garage");
        const kitchen = await aUnit("Kitchen");
        const whisk = await createItem.execute({
          storageUnitId: garage.id,
          name: "Whisk",
        });

        await moveItems.execute({
          itemIds: [whisk.id],
          targetUnitId: kitchen.id,
        });

        const rows = await listItems.execute();
        expect(formatStorageUnitPath(rows[0]?.path ?? [])).toBe("Kitchen");
      });

      it("shows a renamed box under its new name", async () => {
        const garage = await aUnit("Garage");
        await createItem.execute({ storageUnitId: garage.id, name: "Drill" });

        await updateStorageUnit.execute({ id: garage.id, name: "Storage room" });

        const rows = await listItems.execute();
        expect(formatStorageUnitPath(rows[0]?.path ?? [])).toBe("Storage room");
      });

      it("carries the tags and the photos, not only the name", async () => {
        const box = await aUnit("Box 3");
        await createItem.execute({
          storageUnitId: box.id,
          name: "HDMI 2.1",
          tags: ["cables"],
          photos: [aPhotoId("photo-1")],
        });

        const rows = await listItems.execute();

        expect(rows[0]?.item.tags).toEqual(["cables"]);
        expect(rows[0]?.item.photos).toEqual(["photo-1"]);
      });
    });

    describe("editing, which is never moving", () => {
      it("renames a unit and reads the new name back", async () => {
        const box = await aUnit("Box 3");

        clock.advanceBy(1_000);
        await updateStorageUnit.execute({ id: box.id, name: "Box 4" });

        expect((await storageUnits.findById(box.id))?.name).toBe("Box 4");
      });

      it("renames a unit without touching the label glued to it", async () => {
        const box = await aUnit("Box 3");

        await updateStorageUnit.execute({ id: box.id, name: "Box 4" });

        expect((await storageUnits.findById(box.id))?.publicId).toBe(box.publicId);
      });

      it("keeps a renamed unit where it was, and keeps its children", async () => {
        const room = await aUnit("Storage room");
        const wardrobe = await aUnit("Metal wardrobe", room.id);
        const box = await aUnit("Box 3", wardrobe.id);

        await updateStorageUnit.execute({ id: wardrobe.id, name: "Wooden wardrobe" });

        const revised = await storageUnits.findById(wardrobe.id);
        expect(revised?.parentId).toBe(room.id);
        expect(formatStorageUnitPath(await getStorageUnitPath.execute(box.id))).toBe(
          "Storage room > Wooden wardrobe > Box 3",
        );
      });

      it("changes a unit's kind and description, and clears the description", async () => {
        const box = await aUnit("Box 3");

        await updateStorageUnit.execute({
          id: box.id,
          kind: StorageUnitKind.BAG,
          description: "Winter clothes",
        });
        expect((await storageUnits.findById(box.id))?.description).toBe(
          "Winter clothes",
        );

        await updateStorageUnit.execute({ id: box.id, description: null });
        const cleared = await storageUnits.findById(box.id);
        expect(cleared?.description).toBeNull();
        expect(cleared?.kind).toBe(StorageUnitKind.BAG);
      });

      it("refuses to edit a unit that is not there", async () => {
        await expect(
          updateStorageUnit.execute({ id: unitId("ghost"), name: "Box 4" }),
        ).rejects.toBeInstanceOf(StorageUnitNotFound);
      });

      it("renames an item and reads the new name back", async () => {
        const box = await aUnit("Box 3");
        const drill = await createItem.execute({
          storageUnitId: box.id,
          name: "Drill",
        });

        clock.advanceBy(1_000);
        await updateItem.execute({ id: drill.id, name: "Cordless drill" });

        expect((await items.findById(drill.id))?.name).toBe("Cordless drill");
      });

      it("retags an item outright, dropping the tags the revision leaves out", async () => {
        const box = await aUnit("Box 3");
        const cable = await createItem.execute({
          storageUnitId: box.id,
          name: "HDMI 2.1",
          tags: ["cables", "typo"],
        });

        await updateItem.execute({ id: cable.id, tags: ["cables", "video"] });

        expect((await items.findById(cable.id))?.tags).toEqual(["cables", "video"]);
      });

      it("takes every tag off an item when the revision asks for none", async () => {
        const box = await aUnit("Box 3");
        const cable = await createItem.execute({
          storageUnitId: box.id,
          name: "HDMI 2.1",
          tags: ["cables"],
        });

        await updateItem.execute({ id: cable.id, tags: [] });

        expect((await items.findById(cable.id))?.tags).toEqual([]);
      });

      it("keeps an edited item in its unit, holding the photos it held", async () => {
        const box = await aUnit("Box 3");
        const drill = await createItem.execute({
          storageUnitId: box.id,
          name: "Drill",
          photos: [aPhotoId("photo-1"), aPhotoId("photo-2")],
        });

        await updateItem.execute({ id: drill.id, name: "Cordless drill" });

        const revised = await items.findById(drill.id);
        expect(revised?.storageUnitId).toBe(box.id);
        expect(revised?.photos).toEqual(["photo-1", "photo-2"]);
      });

      it("leaves the stored item alone when the new quantity is refused", async () => {
        const box = await aUnit("Box 3");
        const drill = await createItem.execute({
          storageUnitId: box.id,
          name: "Drill",
        });

        await expect(
          updateItem.execute({ id: drill.id, name: "Cordless drill", quantity: 0 }),
        ).rejects.toBeInstanceOf(InvalidQuantity);
        expect((await items.findById(drill.id))?.name).toBe("Drill");
      });

      it("refuses to edit an item that is not there", async () => {
        await expect(
          updateItem.execute({ id: itemId("ghost"), name: "Cordless drill" }),
        ).rejects.toBeInstanceOf(ItemNotFound);
      });
    });
  });
};
