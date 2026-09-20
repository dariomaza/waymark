import { beforeEach, describe, expect, it } from "vitest";

import { FakeClock } from "../shared/clock.fake.js";
import {
  SequentialIdGenerator,
  SequentialPublicIdGenerator,
} from "../shared/id-generator.fake.js";
import { unitId, type UnitId } from "../shared/identity.js";
import { CreateStorageUnit } from "./create-storage-unit.js";
import { StorageUnitNotFound } from "./storage-unit-errors.js";
import { StorageUnitKind } from "./storage-unit.js";
import { InMemoryStorageUnitRepository } from "./storage-unit-repository.fake.js";
import { UpdateStorageUnit } from "./update-storage-unit.js";

const CREATED_AT = new Date("2026-01-01T10:00:00.000Z");
const EDITED_AT = new Date("2026-02-02T11:00:00.000Z");

describe("UpdateStorageUnit", () => {
  let storageUnits: InMemoryStorageUnitRepository;
  let clock: FakeClock;
  let createStorageUnit: CreateStorageUnit;
  let updateStorageUnit: UpdateStorageUnit;

  const create = async (name: string, parentId: UnitId | null = null) =>
    createStorageUnit.execute({
      parentId,
      name,
      kind: StorageUnitKind.BOX,
      description: "Cables, mostly",
    });

  beforeEach(() => {
    storageUnits = new InMemoryStorageUnitRepository();
    clock = new FakeClock(CREATED_AT);
    createStorageUnit = new CreateStorageUnit({
      storageUnits,
      ids: new SequentialIdGenerator("unit"),
      publicIds: new SequentialPublicIdGenerator(),
      clock,
    });
    updateStorageUnit = new UpdateStorageUnit({ storageUnits, clock });
  });

  it("renames a unit and stores the new name", async () => {
    const box = await create("Box 3");
    clock.advanceTo(EDITED_AT);

    const revised = await updateStorageUnit.execute({
      id: box.id,
      name: "Box 4",
    });

    expect(revised.name).toBe("Box 4");
    await expect(storageUnits.findById(box.id)).resolves.toEqual(revised);
  });

  it("stamps the revision with the clock, not with the create time", async () => {
    const box = await create("Box 3");
    clock.advanceTo(EDITED_AT);

    const revised = await updateStorageUnit.execute({ id: box.id, name: "Box 4" });

    expect(revised.updatedAt).toEqual(EDITED_AT);
    expect(revised.createdAt).toEqual(CREATED_AT);
  });

  it("changes the description and the kind together", async () => {
    const box = await create("Box 3");

    const revised = await updateStorageUnit.execute({
      id: box.id,
      description: "Winter clothes",
      kind: StorageUnitKind.BAG,
    });

    expect(revised.description).toBe("Winter clothes");
    expect(revised.kind).toBe(StorageUnitKind.BAG);
    expect(revised.name).toBe("Box 3");
  });

  it("clears a description when the revision says null", async () => {
    const box = await create("Box 3");

    const revised = await updateStorageUnit.execute({
      id: box.id,
      description: null,
    });

    expect(revised.description).toBeNull();
  });

  it("leaves the unit where it is: editing is not moving (ADR 2)", async () => {
    const garage = await create("Garage");
    const box = await create("Box 3", garage.id);

    const revised = await updateStorageUnit.execute({ id: box.id, name: "Box 4" });

    expect(revised.parentId).toBe(garage.id);
  });

  it("keeps the public id printed on the box, so the label still works", async () => {
    const box = await create("Box 3");

    const revised = await updateStorageUnit.execute({ id: box.id, name: "Box 4" });

    expect(revised.publicId).toBe(box.publicId);
  });

  it("refuses to edit a unit nobody stored", async () => {
    await expect(
      updateStorageUnit.execute({ id: unitId("ghost"), name: "Box 4" }),
    ).rejects.toBeInstanceOf(StorageUnitNotFound);
  });

  it("writes nothing when the unit is not there", async () => {
    await expect(
      updateStorageUnit.execute({ id: unitId("ghost"), name: "Box 4" }),
    ).rejects.toBeInstanceOf(StorageUnitNotFound);

    expect(storageUnits.size).toBe(0);
  });
});
