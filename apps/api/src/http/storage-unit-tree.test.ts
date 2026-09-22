import { StorageUnitKind, createStorageUnit, publicId, unitId, type StorageUnit, type UnitId } from "@waymark/domain";
import { describe, expect, it } from "vitest";

import { CorruptStorageUnitHierarchy } from "../persistence/persistence-errors.js";
import { buildStorageUnitForest } from "./storage-unit-tree.js";

const NOW = new Date("2026-03-14T09:26:53.589Z");

const aUnit = (id: string, parentId: UnitId | null = null, name = `Unit ${id}`): StorageUnit =>
  createStorageUnit({
    id: unitId(id),
    parentId,
    name,
    kind: StorageUnitKind.BOX,
    publicId: publicId(`PUB-${id.toUpperCase()}`),
    now: NOW,
  });

describe("buildStorageUnitForest", () => {
  it("returns nothing for an empty inventory", () => {
    expect(buildStorageUnitForest([])).toEqual([]);
  });

  it("nests a unit under its parent", () => {
    const room = aUnit("room");
    const box = aUnit("box", room.id);

    const forest = buildStorageUnitForest([box, room]);

    expect(forest).toHaveLength(1);
    expect(forest[0]?.unit.id).toBe("room");
    expect(forest[0]?.children[0]?.unit.id).toBe("box");
  });

  it("nests to the depth ADR 1 actually produces", () => {
    const house = aUnit("house");
    const room = aUnit("room", house.id);
    const wardrobe = aUnit("wardrobe", room.id);
    const shelf = aUnit("shelf", wardrobe.id);
    const box = aUnit("box", shelf.id);

    const forest = buildStorageUnitForest([box, shelf, wardrobe, room, house]);

    expect(
      forest[0]?.children[0]?.children[0]?.children[0]?.children[0]?.unit.id,
    ).toBe("box");
  });

  it("returns several roots side by side", () => {
    const forest = buildStorageUnitForest([aUnit("garage"), aUnit("attic")]);

    expect(forest.map((node) => node.unit.id)).toEqual(["attic", "garage"]);
  });

  it("orders siblings by name, so the tree does not reshuffle between reads", () => {
    const room = aUnit("room");
    const forest = buildStorageUnitForest([
      room,
      aUnit("c", room.id, "Crate"),
      aUnit("a", room.id, "Armchair"),
      aUnit("b", room.id, "Box"),
    ]);

    expect(forest[0]?.children.map((node) => node.unit.name)).toEqual([
      "Armchair",
      "Box",
      "Crate",
    ]);
  });

  it("orders siblings with the same name by id, so the order is total", () => {
    const room = aUnit("room");
    const forest = buildStorageUnitForest([
      room,
      aUnit("z", room.id, "Box"),
      aUnit("a", room.id, "Box"),
    ]);

    expect(forest[0]?.children.map((node) => node.unit.id)).toEqual(["a", "z"]);
  });

  it("surfaces a unit whose parent is missing rather than swallowing it", () => {
    const orphan = aUnit("orphan", unitId("a-unit-that-is-not-here"));

    const forest = buildStorageUnitForest([orphan]);

    // Losing a box because its parent row vanished is exactly the failure a
    // person would only notice months later, looking for the box.
    expect(forest.map((node) => node.unit.id)).toEqual(["orphan"]);
  });

  it("refuses to render a stored cycle instead of quietly dropping it", () => {
    const room = aUnit("room", unitId("box"));
    const wardrobe = aUnit("wardrobe", room.id);
    const box = aUnit("box", wardrobe.id);

    expect(() => buildStorageUnitForest([room, wardrobe, box])).toThrow(
      CorruptStorageUnitHierarchy,
    );
  });
});
