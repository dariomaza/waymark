import { beforeEach, describe, expect, it } from "vitest";

import { FakeClock } from "../shared/clock.fake.js";
import { photoId, unitId } from "../shared/identity.js";
import {
  SequentialIdGenerator,
  SequentialPublicIdGenerator,
} from "../shared/id-generator.fake.js";
import { CreateStorageUnit } from "./create-storage-unit.js";
import { StorageUnitNotFound } from "./storage-unit-errors.js";
import { StorageUnitKind } from "./storage-unit.js";
import { InMemoryStorageUnitRepository } from "./storage-unit-repository.fake.js";

describe("CreateStorageUnit", () => {
  let storageUnits: InMemoryStorageUnitRepository;
  let clock: FakeClock;
  let createStorageUnit: CreateStorageUnit;

  beforeEach(() => {
    storageUnits = new InMemoryStorageUnitRepository();
    clock = new FakeClock(new Date("2026-01-01T10:00:00.000Z"));
    createStorageUnit = new CreateStorageUnit({
      storageUnits,
      ids: new SequentialIdGenerator("unit"),
      publicIds: new SequentialPublicIdGenerator(),
      clock,
    });
  });

  it("stores a new root unit so it can be found again", async () => {
    const created = await createStorageUnit.execute({
      name: "Storage room",
      kind: StorageUnitKind.ROOM,
    });

    expect(created.parentId).toBeNull();
    await expect(storageUnits.findById(created.id)).resolves.toEqual(created);
  });

  it("assigns a generated id and a generated public id", async () => {
    const first = await createStorageUnit.execute({
      name: "Storage room",
      kind: StorageUnitKind.ROOM,
    });
    const second = await createStorageUnit.execute({
      name: "Garage",
      kind: StorageUnitKind.ROOM,
    });

    expect(first.id).toBe("unit-1");
    expect(first.publicId).toBe("PUB-1");
    expect(second.id).toBe("unit-2");
    expect(second.publicId).toBe("PUB-2");
  });

  it("timestamps the unit with the clock", async () => {
    const created = await createStorageUnit.execute({
      name: "Storage room",
      kind: StorageUnitKind.ROOM,
    });

    expect(created.createdAt).toEqual(new Date("2026-01-01T10:00:00.000Z"));
    expect(created.updatedAt).toEqual(new Date("2026-01-01T10:00:00.000Z"));
  });

  it("stores a new unit inside an existing parent", async () => {
    const room = await createStorageUnit.execute({
      name: "Storage room",
      kind: StorageUnitKind.ROOM,
    });

    const wardrobe = await createStorageUnit.execute({
      parentId: room.id,
      name: "Metal wardrobe",
      kind: StorageUnitKind.FURNITURE,
    });

    expect(wardrobe.parentId).toBe(room.id);
    await expect(storageUnits.findChildren(room.id)).resolves.toEqual([
      wardrobe,
    ]);
  });

  it("keeps the optional description and cover photo", async () => {
    const created = await createStorageUnit.execute({
      name: "Storage room",
      kind: StorageUnitKind.ROOM,
      description: "Behind the garage",
      photoId: photoId("photo-1"),
    });

    expect(created.description).toBe("Behind the garage");
    expect(created.photoId).toBe("photo-1");
  });

  it("rejects creating a unit inside a parent that does not exist", async () => {
    await expect(
      createStorageUnit.execute({
        parentId: unitId("ghost"),
        name: "Box 3",
        kind: StorageUnitKind.BOX,
      }),
    ).rejects.toBeInstanceOf(StorageUnitNotFound);
  });

  it("stores nothing when the parent does not exist", async () => {
    await expect(
      createStorageUnit.execute({
        parentId: unitId("ghost"),
        name: "Box 3",
        kind: StorageUnitKind.BOX,
      }),
    ).rejects.toBeInstanceOf(StorageUnitNotFound);

    expect(storageUnits.size).toBe(0);
  });
});
