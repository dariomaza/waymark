import { beforeEach, describe, expect, it } from "vitest";

import { CreateItem } from "../items/create-item.js";
import { ItemNotFound, PhotoNotOnItem, TooManyItemPhotos } from "../items/item-errors.js";
import { InMemoryItemRepository } from "../items/item-repository.fake.js";
import { coverPhotoId, MAX_ITEM_PHOTOS, type Item } from "../items/item.js";
import { FakeClock } from "../shared/clock.fake.js";
import {
  SequentialIdGenerator,
  SequentialPublicIdGenerator,
} from "../shared/id-generator.fake.js";
import { itemId, photoId, unitId, type PhotoId } from "../shared/identity.js";
import { CreateStorageUnit } from "../storage-units/create-storage-unit.js";
import { StorageUnitNotFound } from "../storage-units/storage-unit-errors.js";
import { InMemoryStorageUnitRepository } from "../storage-units/storage-unit-repository.fake.js";
import { StorageUnitKind, type StorageUnit } from "../storage-units/storage-unit.js";
import { AttachItemPhoto } from "./attach-item-photo.js";
import { DetachItemPhoto } from "./detach-item-photo.js";
import { createPhoto, type Photo } from "./photo.js";
import { InMemoryPhotoRepository } from "./photo-repository.fake.js";
import { ReorderItemPhotos } from "./reorder-item-photos.js";
import { SetStorageUnitPhoto } from "./set-storage-unit-photo.js";

const START = new Date("2026-04-01T10:00:00.000Z");

const aPhoto = (id: string): Photo =>
  createPhoto({
    id: photoId(id),
    originalPath: `ab/${id}.jpg`,
    thumbnailPath: `ab/${id}.thumb.jpg`,
  });

describe("photo use cases", () => {
  let items: InMemoryItemRepository;
  let storageUnits: InMemoryStorageUnitRepository;
  let photos: InMemoryPhotoRepository;
  let clock: FakeClock;
  let createItem: CreateItem;
  let createStorageUnit: CreateStorageUnit;
  let attachItemPhoto: AttachItemPhoto;
  let detachItemPhoto: DetachItemPhoto;
  let reorderItemPhotos: ReorderItemPhotos;
  let setStorageUnitPhoto: SetStorageUnitPhoto;

  beforeEach(() => {
    items = new InMemoryItemRepository();
    storageUnits = new InMemoryStorageUnitRepository();
    photos = new InMemoryPhotoRepository();
    clock = new FakeClock(START);
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
    attachItemPhoto = new AttachItemPhoto({ items, photos, clock });
    detachItemPhoto = new DetachItemPhoto({ items, clock });
    reorderItemPhotos = new ReorderItemPhotos({ items, clock });
    setStorageUnitPhoto = new SetStorageUnitPhoto({ storageUnits, photos, clock });
  });

  const aBox = async (): Promise<StorageUnit> =>
    createStorageUnit.execute({ name: "Box 3", kind: StorageUnitKind.BOX });

  const anItem = async (): Promise<Item> => {
    const box = await aBox();
    return createItem.execute({ storageUnitId: box.id, name: "Cordless drill" });
  };

  describe("AttachItemPhoto", () => {
    it("stores the photo and puts it on the item", async () => {
      const item = await anItem();
      const photo = aPhoto("photo-1");

      const result = await attachItemPhoto.execute({ itemId: item.id, photo });

      expect(result.item.photos).toEqual(["photo-1"]);
      expect(await photos.findById(photo.id)).toEqual(photo);
      expect((await items.findById(item.id))?.photos).toEqual(["photo-1"]);
    });

    it("keeps the first photo as the cover", async () => {
      const item = await anItem();
      await attachItemPhoto.execute({ itemId: item.id, photo: aPhoto("first") });

      const result = await attachItemPhoto.execute({
        itemId: item.id,
        photo: aPhoto("second"),
      });

      expect(coverPhotoId(result.item)).toBe("first");
    });

    it("rejects an unknown item before storing anything", async () => {
      await expect(
        attachItemPhoto.execute({ itemId: itemId("ghost"), photo: aPhoto("photo-1") }),
      ).rejects.toBeInstanceOf(ItemNotFound);

      expect(photos.size).toBe(0);
    });

    /**
     * The order matters. Storing the photo row first and discovering the cap
     * afterwards would leave a row nothing references, pointing at files nobody
     * will ever release.
     */
    it("stores nothing when the item is already full", async () => {
      const item = await anItem();
      for (let index = 0; index < MAX_ITEM_PHOTOS; index += 1) {
        await attachItemPhoto.execute({ itemId: item.id, photo: aPhoto(`p${index}`) });
      }

      await expect(
        attachItemPhoto.execute({ itemId: item.id, photo: aPhoto("one-more") }),
      ).rejects.toBeInstanceOf(TooManyItemPhotos);

      expect(photos.size).toBe(MAX_ITEM_PHOTOS);
      expect(await photos.findById(photoId("one-more"))).toBeNull();
    });

    it("stamps the item with the current time", async () => {
      const item = await anItem();
      clock.advanceBy(60_000);

      const result = await attachItemPhoto.execute({
        itemId: item.id,
        photo: aPhoto("photo-1"),
      });

      expect(result.item.updatedAt).toEqual(new Date(START.getTime() + 60_000));
    });
  });

  describe("DetachItemPhoto", () => {
    const withPhotos = async (ids: readonly string[]): Promise<Item> => {
      const item = await anItem();
      let current = item;
      for (const id of ids) {
        current = (await attachItemPhoto.execute({ itemId: item.id, photo: aPhoto(id) }))
          .item;
      }

      return current;
    };

    it("takes the photo off and hands back what to release", async () => {
      const item = await withPhotos(["a", "b"]);

      const result = await detachItemPhoto.execute({
        itemId: item.id,
        photoId: photoId("a"),
      });

      expect(result.item.photos).toEqual(["b"]);
      expect(result.releasedPhotoIds).toEqual(["a"]);
    });

    /**
     * The row survives the domain call on purpose: the files are still on disk,
     * and only the caller can remove them. Forgetting the row here would lose
     * the paths that make the files findable.
     */
    it("leaves the photo row for the caller to release", async () => {
      const item = await withPhotos(["a"]);

      await detachItemPhoto.execute({ itemId: item.id, photoId: photoId("a") });

      expect(await photos.findById(photoId("a"))).not.toBeNull();
    });

    it("refuses a photo the item never held", async () => {
      const item = await withPhotos(["a"]);

      await expect(
        detachItemPhoto.execute({ itemId: item.id, photoId: photoId("elsewhere") }),
      ).rejects.toBeInstanceOf(PhotoNotOnItem);
    });

    it("refuses an unknown item", async () => {
      await expect(
        detachItemPhoto.execute({ itemId: itemId("ghost"), photoId: photoId("a") }),
      ).rejects.toBeInstanceOf(ItemNotFound);
    });
  });

  describe("ReorderItemPhotos", () => {
    const withPhotos = async (ids: readonly string[]): Promise<Item> => {
      const item = await anItem();
      for (const id of ids) {
        await attachItemPhoto.execute({ itemId: item.id, photo: aPhoto(id) });
      }

      return (await items.findById(item.id)) as Item;
    };

    it("chooses the cover by putting a photo first", async () => {
      const item = await withPhotos(["a", "b", "c"]);

      const result = await reorderItemPhotos.execute({
        itemId: item.id,
        photoIds: [photoId("c"), photoId("b"), photoId("a")],
      });

      expect(result.photos).toEqual(["c", "b", "a"]);
      expect(coverPhotoId(result)).toBe("c");
      expect((await items.findById(item.id))?.photos).toEqual(["c", "b", "a"]);
    });

    it("refuses an order that is not the whole list", async () => {
      const item = await withPhotos(["a", "b"]);

      await expect(
        reorderItemPhotos.execute({ itemId: item.id, photoIds: [photoId("b")] }),
      ).rejects.toBeInstanceOf(PhotoNotOnItem);
    });

    it("refuses an unknown item", async () => {
      await expect(
        reorderItemPhotos.execute({ itemId: itemId("ghost"), photoIds: [] }),
      ).rejects.toBeInstanceOf(ItemNotFound);
    });
  });

  describe("SetStorageUnitPhoto", () => {
    it("gives a unit its one photo", async () => {
      const box = await aBox();
      const photo = aPhoto("photo-1");

      const result = await setStorageUnitPhoto.execute({ unitId: box.id, photo });

      expect(result.unit.photoId).toBe("photo-1");
      expect(result.releasedPhotoIds).toEqual([]);
      expect(await photos.findById(photo.id)).toEqual(photo);
    });

    /**
     * A unit has ONE photo (`photoId`, not a list), so setting a new one is a
     * replacement. The old one has to come back as released, or its files stay
     * on disk forever with nothing pointing at them.
     */
    it("releases the photo it replaces", async () => {
      const box = await aBox();
      await setStorageUnitPhoto.execute({ unitId: box.id, photo: aPhoto("old") });

      const result = await setStorageUnitPhoto.execute({
        unitId: box.id,
        photo: aPhoto("new"),
      });

      expect(result.unit.photoId).toBe("new");
      expect(result.releasedPhotoIds).toEqual(["old"]);
    });

    it("clears the photo and releases it", async () => {
      const box = await aBox();
      await setStorageUnitPhoto.execute({ unitId: box.id, photo: aPhoto("old") });

      const result = await setStorageUnitPhoto.execute({ unitId: box.id, photo: null });

      expect(result.unit.photoId).toBeNull();
      expect(result.releasedPhotoIds).toEqual(["old"]);
    });

    it("clearing a unit with no photo releases nothing", async () => {
      const box = await aBox();

      const result = await setStorageUnitPhoto.execute({ unitId: box.id, photo: null });

      expect(result.releasedPhotoIds).toEqual([]);
    });

    it("refuses an unknown unit before storing anything", async () => {
      await expect(
        setStorageUnitPhoto.execute({ unitId: unitId("ghost"), photo: aPhoto("p") }),
      ).rejects.toBeInstanceOf(StorageUnitNotFound);

      expect(photos.size).toBe(0);
    });

    it("stamps the unit with the current time", async () => {
      const box = await aBox();
      clock.advanceBy(60_000);

      const result = await setStorageUnitPhoto.execute({
        unitId: box.id,
        photo: aPhoto("photo-1"),
      });

      expect(result.unit.updatedAt).toEqual(new Date(START.getTime() + 60_000));
    });
  });
});

/** Kept honest: the fixture builder really does produce distinct ids. */
describe("the photo fixture", () => {
  it("builds distinct photos", () => {
    const ids: readonly PhotoId[] = [aPhoto("a").id, aPhoto("b").id];

    expect(new Set(ids).size).toBe(2);
  });
});
