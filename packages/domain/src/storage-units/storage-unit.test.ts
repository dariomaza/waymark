import { describe, expect, it } from "vitest";

import { photoId, publicId, unitId } from "../shared/identity.js";
import {
  createStorageUnit,
  reparentStorageUnit,
  StorageUnitKind,
} from "./storage-unit.js";

const createdAt = new Date("2026-01-01T10:00:00.000Z");

describe("StorageUnit", () => {
  it("is created as a root when no parent is given", () => {
    const unit = createStorageUnit({
      id: unitId("unit-1"),
      name: "Storage room",
      kind: StorageUnitKind.ROOM,
      publicId: publicId("PUB-1"),
      now: createdAt,
    });

    expect(unit.parentId).toBeNull();
  });

  it("is created inside its parent when a parent is given", () => {
    const unit = createStorageUnit({
      id: unitId("unit-2"),
      parentId: unitId("unit-1"),
      name: "Wardrobe",
      kind: StorageUnitKind.FURNITURE,
      publicId: publicId("PUB-2"),
      now: createdAt,
    });

    expect(unit.parentId).toBe("unit-1");
  });

  it("defaults description and photo to absent", () => {
    const unit = createStorageUnit({
      id: unitId("unit-1"),
      name: "Storage room",
      kind: StorageUnitKind.ROOM,
      publicId: publicId("PUB-1"),
      now: createdAt,
    });

    expect(unit.description).toBeNull();
    expect(unit.photoId).toBeNull();
  });

  it("keeps the description and cover photo it was given", () => {
    const unit = createStorageUnit({
      id: unitId("unit-1"),
      name: "Storage room",
      kind: StorageUnitKind.ROOM,
      description: "Behind the garage",
      photoId: photoId("photo-1"),
      publicId: publicId("PUB-1"),
      now: createdAt,
    });

    expect(unit.description).toBe("Behind the garage");
    expect(unit.photoId).toBe("photo-1");
  });

  it("trims surrounding whitespace from the name so equal places stay equal", () => {
    const unit = createStorageUnit({
      id: unitId("unit-1"),
      name: "  Storage room  ",
      kind: StorageUnitKind.ROOM,
      publicId: publicId("PUB-1"),
      now: createdAt,
    });

    expect(unit.name).toBe("Storage room");
  });

  it("starts with equal creation and update timestamps", () => {
    const unit = createStorageUnit({
      id: unitId("unit-1"),
      name: "Storage room",
      kind: StorageUnitKind.ROOM,
      publicId: publicId("PUB-1"),
      now: createdAt,
    });

    expect(unit.createdAt).toEqual(createdAt);
    expect(unit.updatedAt).toEqual(createdAt);
  });

  it("returns a new unit under the new parent when reparented", () => {
    const unit = createStorageUnit({
      id: unitId("unit-2"),
      parentId: unitId("unit-1"),
      name: "Wardrobe",
      kind: StorageUnitKind.FURNITURE,
      publicId: publicId("PUB-2"),
      now: createdAt,
    });
    const movedAt = new Date("2026-02-02T11:00:00.000Z");

    const moved = reparentStorageUnit(unit, unitId("unit-9"), movedAt);

    expect(moved.parentId).toBe("unit-9");
    expect(moved.updatedAt).toEqual(movedAt);
    expect(moved.createdAt).toEqual(createdAt);
    expect(unit.parentId).toBe("unit-1");
  });

  it("becomes a root when reparented to no parent", () => {
    const unit = createStorageUnit({
      id: unitId("unit-2"),
      parentId: unitId("unit-1"),
      name: "Wardrobe",
      kind: StorageUnitKind.FURNITURE,
      publicId: publicId("PUB-2"),
      now: createdAt,
    });

    const moved = reparentStorageUnit(unit, null, createdAt);

    expect(moved.parentId).toBeNull();
  });
});
