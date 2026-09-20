import { publicId, unitId } from "@ariadna/domain";
import { describe, expect, it } from "vitest";

import { findById, findByPublicId, flattenUnits } from "./storage-unit-tree.js";
import { aStorageUnit, aTree } from "./testing/fixtures.js";

const garage = aStorageUnit({ id: "garage", name: "Garage" });
const wardrobe = aStorageUnit({
  id: "wardrobe",
  parentId: "garage",
  name: "Metal wardrobe",
});
const box = aStorageUnit({
  id: "box3",
  parentId: "wardrobe",
  name: "Box 3",
  publicId: "7ZK3QWERTY",
});

const forest = [aTree(garage, [aTree(wardrobe, [aTree(box)])])];

describe("the forest a picker reads", () => {
  it("carries the path to each unit, so two boxes called Box 3 are told apart", () => {
    expect(flattenUnits(forest).map((entry) => entry.location)).toEqual([
      "Garage",
      "Garage > Metal wardrobe",
      "Garage > Metal wardrobe > Box 3",
    ]);
  });

  it("says how deep each unit sits, so a picker can indent it", () => {
    expect(flattenUnits(forest).map((entry) => entry.depth)).toEqual([0, 1, 2]);
  });
});

describe("resolving a scanned code against the forest", () => {
  /**
   * ADR 12: the API has no route that answers a public id, and the forest is
   * one request both clients already make for their own navigation.
   */
  it("finds the box a label names", () => {
    expect(findByPublicId(forest, publicId("7ZK3QWERTY"))?.name).toBe("Box 3");
  });

  it("answers nothing for a label no box in this house carries", () => {
    expect(findByPublicId(forest, publicId("NOTALABEL0"))).toBeNull();
  });

  it("finds a unit by its internal id, for a search scope", () => {
    expect(findById(forest, unitId("wardrobe"))?.name).toBe("Metal wardrobe");
    expect(findById(forest, unitId("nowhere"))).toBeNull();
  });
});
