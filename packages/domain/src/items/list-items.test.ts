import { beforeEach, describe, expect, it } from "vitest";

import { FakeClock } from "../shared/clock.fake.js";
import {
  SequentialIdGenerator,
  SequentialPublicIdGenerator,
} from "../shared/id-generator.fake.js";
import { itemId, unitId, type UnitId } from "../shared/identity.js";
import { CreateStorageUnit } from "../storage-units/create-storage-unit.js";
import { formatStorageUnitPath } from "../storage-units/get-storage-unit-path.js";
import type { StorageUnit } from "../storage-units/storage-unit.js";
import { StorageUnitKind } from "../storage-units/storage-unit.js";
import { InMemoryStorageUnitRepository } from "../storage-units/storage-unit-repository.fake.js";
import { CreateItem } from "./create-item.js";
import { createItem as createItemEntity } from "./item.js";
import { InMemoryItemRepository } from "./item-repository.fake.js";
import { ListItems } from "./list-items.js";

const A_MOMENT = new Date("2026-01-01T10:00:00.000Z");

/** Counts how often the forest is read, which is the whole design here. */
class CountingStorageUnits extends InMemoryStorageUnitRepository {
  reads = 0;

  override async findAll(): Promise<StorageUnit[]> {
    this.reads += 1;

    return super.findAll();
  }
}

describe("ListItems", () => {
  let items: InMemoryItemRepository;
  let storageUnits: CountingStorageUnits;
  let createStorageUnit: CreateStorageUnit;
  let createItem: CreateItem;
  let listItems: ListItems;

  const aUnit = async (name: string, parentId: UnitId | null = null) =>
    createStorageUnit.execute({ name, kind: StorageUnitKind.BOX, parentId });

  const anItem = async (name: string, storageUnitId: UnitId) =>
    createItem.execute({ storageUnitId, name });

  const locations = async (): Promise<string[]> =>
    (await listItems.execute()).map(
      (row) => `${row.item.name} @ ${formatStorageUnitPath(row.path)}`,
    );

  beforeEach(() => {
    items = new InMemoryItemRepository();
    storageUnits = new CountingStorageUnits();
    const clock = new FakeClock(A_MOMENT);
    createStorageUnit = new CreateStorageUnit({
      storageUnits,
      ids: new SequentialIdGenerator("unit"),
      publicIds: new SequentialPublicIdGenerator(),
      clock,
    });
    createItem = new CreateItem({
      items,
      storageUnits,
      ids: new SequentialIdGenerator("item"),
      clock,
    });
    listItems = new ListItems({ items, storageUnits });
  });

  it("answers with nothing when nothing is stored", async () => {
    await expect(listItems.execute()).resolves.toEqual([]);
  });

  it("answers with every item in the house, whichever box holds it", async () => {
    const garage = await aUnit("Garage");
    const kitchen = await aUnit("Kitchen");
    await anItem("Drill", garage.id);
    await anItem("Whisk", kitchen.id);

    const rows = await listItems.execute();

    expect(rows.map((row) => row.item.name)).toEqual(["Drill", "Whisk"]);
  });

  it("carries the whole breadcrumb, because a name on its own answers nothing", async () => {
    const garage = await aUnit("Garage");
    const wardrobe = await aUnit("Metal wardrobe", garage.id);
    const box = await aUnit("Box 3", wardrobe.id);
    await anItem("Cordless drill", box.id);

    await expect(locations()).resolves.toEqual([
      "Cordless drill @ Garage > Metal wardrobe > Box 3",
    ]);
  });

  it("carries the path of an item held directly by a root", async () => {
    const garage = await aUnit("Garage");
    await anItem("Drill", garage.id);

    await expect(locations()).resolves.toEqual(["Drill @ Garage"]);
  });

  it("orders by name, so two reads of an unchanged inventory look the same", async () => {
    const box = await aUnit("Box 3");
    await anItem("Whisk", box.id);
    await anItem("Anvil", box.id);
    await anItem("Drill", box.id);

    const rows = await listItems.execute();

    expect(rows.map((row) => row.item.name)).toEqual(["Anvil", "Drill", "Whisk"]);
  });

  it("breaks a tie on the name with the id, so the order is total", async () => {
    const box = await aUnit("Box 3");
    const first = await anItem("Drill", box.id);
    const second = await anItem("Drill", box.id);

    const rows = await listItems.execute();

    expect(rows.map((row) => row.item.id)).toEqual(
      [first.id, second.id].sort((left, right) => left.localeCompare(right)),
    );
  });

  it("reads the forest once, however many items there are", async () => {
    const garage = await aUnit("Garage");
    const box = await aUnit("Box 3", garage.id);
    await anItem("Drill", box.id);
    await anItem("Sander", box.id);
    await anItem("Whisk", garage.id);
    storageUnits.reads = 0;

    await listItems.execute();

    // A path walked per item would be a read per item, which is the very N+1
    // this use case exists to remove.
    expect(storageUnits.reads).toBe(1);
  });

  it("still lists an item whose unit is missing, with no path to show", async () => {
    // Only reachable when the stored data contradicts itself; a relational
    // adapter has a foreign key. Losing the whole screen over one such row
    // would hide every other item in the house, which is the worse answer.
    await items.save(
      createItemEntity({
        id: itemId("orphan"),
        storageUnitId: unitId("ghost"),
        name: "Orphan",
        now: A_MOMENT,
      }),
    );

    const rows = await listItems.execute();

    expect(rows.map((row) => row.item.name)).toEqual(["Orphan"]);
    expect(rows[0]?.path).toEqual([]);
  });

  it("terminates on a tree a bad restore turned into a cycle", async () => {
    const left = await aUnit("Left");
    const right = await aUnit("Right", left.id);
    await anItem("Drill", right.id);
    // Straight into storage, past the use case that forbids it (ADR 2).
    await storageUnits.save({ ...left, parentId: right.id });

    const rows = await listItems.execute();

    expect(rows).toHaveLength(1);
  });
});
