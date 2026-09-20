import { describe, expect, it } from "vitest";

import { itemId, photoId, unitId } from "../shared/identity.js";
import { InvalidQuantity } from "./item-errors.js";
import { coverPhotoId, createItem, moveItemTo } from "./item.js";

const createdAt = new Date("2026-01-01T10:00:00.000Z");

const baseInput = {
  id: itemId("item-1"),
  storageUnitId: unitId("unit-1"),
  name: "Drill",
  now: createdAt,
};

describe("Item", () => {
  it("holds a single unit when no quantity is given", () => {
    expect(createItem(baseInput).quantity).toBe(1);
  });

  it("keeps the quantity it was given", () => {
    expect(createItem({ ...baseInput, quantity: 7 }).quantity).toBe(7);
  });

  it("rejects a quantity below one", () => {
    expect(() => createItem({ ...baseInput, quantity: 0 })).toThrow(
      InvalidQuantity,
    );
    expect(() => createItem({ ...baseInput, quantity: -3 })).toThrow(
      InvalidQuantity,
    );
  });

  it("rejects a fractional quantity", () => {
    expect(() => createItem({ ...baseInput, quantity: 1.5 })).toThrow(
      InvalidQuantity,
    );
  });

  it("reports the offending quantity on the error", () => {
    expect(() => createItem({ ...baseInput, quantity: 0 })).toThrow(
      /quantity/i,
    );

    try {
      createItem({ ...baseInput, quantity: 0 });
      expect.unreachable("createItem should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidQuantity);
      expect((error as InvalidQuantity).quantity).toBe(0);
    }
  });

  it("starts with no tags and no photos", () => {
    const item = createItem(baseInput);

    expect(item.tags).toEqual([]);
    expect(item.photos).toEqual([]);
  });

  it("defaults the description to absent", () => {
    expect(createItem(baseInput).description).toBeNull();
  });

  it("preserves the order of the photos it was given", () => {
    const item = createItem({
      ...baseInput,
      photos: [photoId("photo-a"), photoId("photo-b"), photoId("photo-c")],
    });

    expect(item.photos).toEqual(["photo-a", "photo-b", "photo-c"]);
  });

  it("uses the first photo as the cover", () => {
    const item = createItem({
      ...baseInput,
      photos: [photoId("photo-a"), photoId("photo-b")],
    });

    expect(coverPhotoId(item)).toBe("photo-a");
  });

  it("has no cover when it has no photos", () => {
    expect(coverPhotoId(createItem(baseInput))).toBeNull();
  });

  it("does not share its tag and photo arrays with the caller", () => {
    const tags = ["tools"];
    const photos = [photoId("photo-a")];
    const item = createItem({ ...baseInput, tags, photos });

    tags.push("mutated");
    photos.push(photoId("photo-z"));

    expect(item.tags).toEqual(["tools"]);
    expect(item.photos).toEqual(["photo-a"]);
  });

  it("returns a new item in the target unit when moved", () => {
    const item = createItem(baseInput);
    const movedAt = new Date("2026-03-03T12:00:00.000Z");

    const moved = moveItemTo(item, unitId("unit-2"), movedAt);

    expect(moved.storageUnitId).toBe("unit-2");
    expect(moved.updatedAt).toEqual(movedAt);
    expect(moved.createdAt).toEqual(createdAt);
    expect(item.storageUnitId).toBe("unit-1");
  });
});
