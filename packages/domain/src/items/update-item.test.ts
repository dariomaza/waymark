import { beforeEach, describe, expect, it } from "vitest";

import { FakeClock } from "../shared/clock.fake.js";
import {
  SequentialIdGenerator,
  SequentialPublicIdGenerator,
} from "../shared/id-generator.fake.js";
import { itemId } from "../shared/identity.js";
import { CreateStorageUnit } from "../storage-units/create-storage-unit.js";
import { StorageUnitKind } from "../storage-units/storage-unit.js";
import { InMemoryStorageUnitRepository } from "../storage-units/storage-unit-repository.fake.js";
import { CreateItem } from "./create-item.js";
import { InvalidQuantity, ItemNotFound } from "./item-errors.js";
import { InMemoryItemRepository } from "./item-repository.fake.js";
import { UpdateItem } from "./update-item.js";

const CREATED_AT = new Date("2026-01-01T10:00:00.000Z");
const EDITED_AT = new Date("2026-02-02T11:00:00.000Z");

describe("UpdateItem", () => {
  let items: InMemoryItemRepository;
  let storageUnits: InMemoryStorageUnitRepository;
  let clock: FakeClock;
  let createItem: CreateItem;
  let updateItem: UpdateItem;

  const create = async () => {
    const box = await new CreateStorageUnit({
      storageUnits,
      ids: new SequentialIdGenerator("unit"),
      publicIds: new SequentialPublicIdGenerator(),
      clock,
    }).execute({ name: "Box 3", kind: StorageUnitKind.BOX });

    return createItem.execute({
      storageUnitId: box.id,
      name: "Drill",
      description: "18V, two batteries",
      quantity: 2,
      tags: ["tools"],
    });
  };

  beforeEach(() => {
    items = new InMemoryItemRepository();
    storageUnits = new InMemoryStorageUnitRepository();
    clock = new FakeClock(CREATED_AT);
    createItem = new CreateItem({
      items,
      storageUnits,
      ids: new SequentialIdGenerator("item"),
      clock,
    });
    updateItem = new UpdateItem({ items, clock });
  });

  it("renames an item and stores the new name", async () => {
    const drill = await create();
    clock.advanceTo(EDITED_AT);

    const revised = await updateItem.execute({
      id: drill.id,
      name: "Cordless drill",
    });

    expect(revised.name).toBe("Cordless drill");
    await expect(items.findById(drill.id)).resolves.toEqual(revised);
  });

  it("stamps the revision with the clock, not with the create time", async () => {
    const drill = await create();
    clock.advanceTo(EDITED_AT);

    const revised = await updateItem.execute({ id: drill.id, name: "Cordless drill" });

    expect(revised.updatedAt).toEqual(EDITED_AT);
    expect(revised.createdAt).toEqual(CREATED_AT);
  });

  it("retags an item outright, so a wrong tag can be taken off", async () => {
    const drill = await create();

    const revised = await updateItem.execute({ id: drill.id, tags: ["diy", "18v"] });

    expect(revised.tags).toEqual(["diy", "18v"]);
  });

  it("changes the quantity and the description together", async () => {
    const drill = await create();

    const revised = await updateItem.execute({
      id: drill.id,
      quantity: 7,
      description: null,
    });

    expect(revised.quantity).toBe(7);
    expect(revised.description).toBeNull();
    expect(revised.name).toBe("Drill");
  });

  it("refuses a quantity the domain would never have created", async () => {
    const drill = await create();

    await expect(
      updateItem.execute({ id: drill.id, quantity: 0 }),
    ).rejects.toBeInstanceOf(InvalidQuantity);
  });

  it("leaves the stored item alone when the revision is refused", async () => {
    const drill = await create();

    await expect(
      updateItem.execute({ id: drill.id, name: "Cordless drill", quantity: 0 }),
    ).rejects.toBeInstanceOf(InvalidQuantity);

    await expect(items.findById(drill.id)).resolves.toEqual(drill);
  });

  it("leaves the item where it is: editing is not moving (ADR 3)", async () => {
    const drill = await create();

    const revised = await updateItem.execute({ id: drill.id, name: "Cordless drill" });

    expect(revised.storageUnitId).toBe(drill.storageUnitId);
  });

  it("keeps the photos it holds, in the order that decides the cover", async () => {
    const drill = await create();

    const revised = await updateItem.execute({ id: drill.id, name: "Cordless drill" });

    expect(revised.photos).toEqual(drill.photos);
  });

  it("refuses to edit an item nobody stored", async () => {
    await expect(
      updateItem.execute({ id: itemId("ghost"), name: "Cordless drill" }),
    ).rejects.toBeInstanceOf(ItemNotFound);
  });

  it("does not invent an item when the id names nothing", async () => {
    await expect(
      updateItem.execute({ id: itemId("ghost"), name: "Cordless drill" }),
    ).rejects.toBeInstanceOf(ItemNotFound);

    await expect(items.findById(itemId("ghost"))).resolves.toBeNull();
  });
});
