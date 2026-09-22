import { publicId, unitId } from "@waymark/domain";
import { describe, expect, it } from "vitest";

import {
  findById,
  findByPublicId,
  flattenUnits,
  subtreeOf,
} from "./storage-unit-tree.js";
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

  /**
   * The names on the way down, WITHOUT the unit itself, because "where is it"
   * and "what is it" are two different questions on a printed label: the name
   * is what somebody reads across a garage and the ancestry is what tells
   * three boxes called `Box 3` apart between the printer and the glue.
   *
   * It is a list rather than the joined string for the same reason the API
   * ships `path` beside `location`: recovering the parts by splitting the
   * joined string on `" > "` is one name containing `" > "` away from wrong.
   */
  it("carries the names on the way down, without the unit itself", () => {
    expect(flattenUnits(forest).map((entry) => entry.ancestry)).toEqual([
      [],
      ["Garage"],
      ["Garage", "Metal wardrobe"],
    ]);
  });

  it("keeps the joined location and the parts in step", () => {
    for (const entry of flattenUnits(forest)) {
      expect([...entry.ancestry, entry.unit.name].join(" > ")).toBe(entry.location);
    }
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

/**
 * # "Everything inside the garage"
 *
 * A location IS a storage unit (ADR 1), so every question about a place is a
 * question about a subtree, and both clients now ask one: labelling a whole
 * storage room in an afternoon means ticking a room rather than sixty boxes.
 *
 * It is here rather than in either app for the reason the rest of this file
 * is: the day the two clients disagree about what is inside the garage is the
 * day one of them prints the wrong sheet.
 */
describe("everything inside a unit", () => {
  const shed = aStorageUnit({ id: "shed", name: "Shed" });
  const bag = aStorageUnit({ id: "bag", parentId: "shed", name: "Bag" });
  const twoRoots = [
    aTree(garage, [aTree(wardrobe, [aTree(box)])]),
    aTree(shed, [aTree(bag)]),
  ];

  it("is every descendant at any depth, and not the unit itself", () => {
    expect(subtreeOf(twoRoots, unitId("garage")).map((unit) => unit.id)).toEqual([
      "wardrobe",
      "box3",
    ]);
  });

  it("stops at the branch it was asked about", () => {
    expect(subtreeOf(twoRoots, unitId("shed")).map((unit) => unit.id)).toEqual(["bag"]);
  });

  it("is empty for a leaf, which is not the same as an error", () => {
    expect(subtreeOf(twoRoots, unitId("box3"))).toEqual([]);
  });

  it("is empty for a unit that is not in this forest at all", () => {
    expect(subtreeOf(twoRoots, unitId("ghost"))).toEqual([]);
  });

  /**
   * The same rule `?within=` has had since ADR 11: a box is not inside
   * itself. A caller that wants the unit too says so, which is one line and
   * cannot be mistaken for the other meaning.
   */
  it("reads depth first, so a sheet comes out in the order the tree is drawn", () => {
    expect(subtreeOf(twoRoots, unitId("garage")).map((unit) => unit.name)).toEqual([
      "Metal wardrobe",
      "Box 3",
    ]);
  });
});
