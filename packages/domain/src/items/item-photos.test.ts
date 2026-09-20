import { describe, expect, it } from "vitest";

import { itemId, photoId, unitId } from "../shared/identity.js";
import {
  attachPhotoToItem,
  coverPhotoId,
  createItem,
  detachPhotoFromItem,
  MAX_ITEM_PHOTOS,
  reorderItemPhotos,
} from "./item.js";
import { PhotoNotOnItem, TooManyItemPhotos } from "./item-errors.js";

const A_MOMENT = new Date("2026-04-01T10:00:00.000Z");
const A_LATER_MOMENT = new Date("2026-04-02T11:00:00.000Z");

const anItem = (photos: readonly string[] = []) =>
  createItem({
    id: itemId("item-1"),
    storageUnitId: unitId("unit-1"),
    name: "Cordless drill",
    photos: photos.map(photoId),
    now: A_MOMENT,
  });

describe("attaching a photo to an item", () => {
  it("appends, so the first photo uploaded stays the cover", () => {
    const item = attachPhotoToItem(anItem(["a"]), photoId("b"), A_LATER_MOMENT);

    expect(item.photos).toEqual(["a", "b"]);
    expect(coverPhotoId(item)).toBe("a");
  });

  it("makes the first photo the cover by definition", () => {
    const item = attachPhotoToItem(anItem(), photoId("a"), A_LATER_MOMENT);

    expect(coverPhotoId(item)).toBe("a");
  });

  it("moves updatedAt", () => {
    expect(attachPhotoToItem(anItem(), photoId("a"), A_LATER_MOMENT).updatedAt).toEqual(
      A_LATER_MOMENT,
    );
  });

  it("does not mutate the item it came from", () => {
    const item = anItem(["a"]);

    attachPhotoToItem(item, photoId("b"), A_LATER_MOMENT);

    expect(item.photos).toEqual(["a"]);
  });

  it("refuses to go past the cap", () => {
    const full = anItem(
      Array.from({ length: MAX_ITEM_PHOTOS }, (_unused, index) => `p${index}`),
    );

    expect(() => attachPhotoToItem(full, photoId("one-more"), A_LATER_MOMENT)).toThrow(
      TooManyItemPhotos,
    );
  });

  it("fills the cap exactly without complaining", () => {
    const nearlyFull = anItem(
      Array.from({ length: MAX_ITEM_PHOTOS - 1 }, (_unused, index) => `p${index}`),
    );

    expect(
      attachPhotoToItem(nearlyFull, photoId("last"), A_LATER_MOMENT).photos,
    ).toHaveLength(MAX_ITEM_PHOTOS);
  });

  it("refuses a photo the item already holds", () => {
    expect(() => attachPhotoToItem(anItem(["a"]), photoId("a"), A_LATER_MOMENT)).toThrow(
      TooManyItemPhotos,
    );
  });
});

describe("creating an item", () => {
  it("refuses more photos than the cap in one go", () => {
    expect(() =>
      createItem({
        id: itemId("item-2"),
        storageUnitId: unitId("unit-1"),
        name: "Too photogenic",
        photos: Array.from({ length: MAX_ITEM_PHOTOS + 1 }, (_u, i) =>
          photoId(`p${i}`),
        ),
        now: A_MOMENT,
      }),
    ).toThrow(TooManyItemPhotos);
  });
});

describe("detaching a photo from an item", () => {
  it("removes it and keeps the rest in order", () => {
    const item = detachPhotoFromItem(
      anItem(["a", "b", "c"]),
      photoId("b"),
      A_LATER_MOMENT,
    );

    expect(item.photos).toEqual(["a", "c"]);
  });

  it("promotes the next photo when the cover is removed", () => {
    const item = detachPhotoFromItem(
      anItem(["a", "b", "c"]),
      photoId("a"),
      A_LATER_MOMENT,
    );

    expect(coverPhotoId(item)).toBe("b");
  });

  it("leaves an item with no cover once its last photo goes", () => {
    const item = detachPhotoFromItem(anItem(["a"]), photoId("a"), A_LATER_MOMENT);

    expect(item.photos).toEqual([]);
    expect(coverPhotoId(item)).toBeNull();
  });

  it("refuses a photo the item does not hold", () => {
    expect(() =>
      detachPhotoFromItem(anItem(["a"]), photoId("elsewhere"), A_LATER_MOMENT),
    ).toThrow(PhotoNotOnItem);
  });
});

describe("reordering the photos of an item", () => {
  it("chooses the cover by putting a photo first", () => {
    const item = reorderItemPhotos(
      anItem(["a", "b", "c"]),
      [photoId("c"), photoId("a"), photoId("b")],
      A_LATER_MOMENT,
    );

    expect(item.photos).toEqual(["c", "a", "b"]);
    expect(coverPhotoId(item)).toBe("c");
  });

  /**
   * A reorder is a statement about the whole list. Accepting a subset would
   * silently drop photos whose files are still on disk, which is a leak that
   * looks like a successful request.
   */
  it("refuses an order that leaves a photo out", () => {
    expect(() =>
      reorderItemPhotos(anItem(["a", "b", "c"]), [photoId("c"), photoId("a")], A_LATER_MOMENT),
    ).toThrow(PhotoNotOnItem);
  });

  it("refuses an order naming a photo the item does not hold", () => {
    expect(() =>
      reorderItemPhotos(
        anItem(["a", "b"]),
        [photoId("a"), photoId("elsewhere")],
        A_LATER_MOMENT,
      ),
    ).toThrow(PhotoNotOnItem);
  });

  it("refuses an order that repeats a photo", () => {
    expect(() =>
      reorderItemPhotos(
        anItem(["a", "b"]),
        [photoId("a"), photoId("a")],
        A_LATER_MOMENT,
      ),
    ).toThrow(PhotoNotOnItem);
  });

  it("accepts the order it already has", () => {
    const item = reorderItemPhotos(
      anItem(["a", "b"]),
      [photoId("a"), photoId("b")],
      A_LATER_MOMENT,
    );

    expect(item.photos).toEqual(["a", "b"]);
  });
});
