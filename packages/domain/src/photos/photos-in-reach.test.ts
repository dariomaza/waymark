import { beforeEach, describe, expect, it } from "vitest";

import { resolveAccess, Role, ShareLevel, type Access } from "../access/access.js";
import { createItem } from "../items/item.js";
import { InMemoryItemRepository } from "../items/item-repository.fake.js";
import { itemId, photoId, publicId, unitId, userId, type UnitId } from "../shared/identity.js";
import { createStorageUnit, StorageUnitKind } from "../storage-units/storage-unit.js";
import { InMemoryStorageUnitRepository } from "../storage-units/storage-unit-repository.fake.js";
import { FindPhoto } from "./find-photo.js";
import { createPhoto, markPhotoFailed, PhotoProcessingStatus } from "./photo.js";
import { InMemoryPhotoRepository } from "./photo-repository.fake.js";
import { ReachablePhotos } from "./reachable-photos.js";
import { RequeuePhotos } from "./requeue-photos.js";

const NOW = new Date("2026-04-01T10:00:00.000Z");

const aPhoto = (id: string) =>
  markPhotoFailed(
    createPhoto({
      id: photoId(id),
      originalPath: `ab/${id}.jpg`,
      thumbnailPath: `ab/${id}.thumb.jpg`,
    }),
  );

const aSpace = (
  id: string,
  options: { parentId?: UnitId; owner?: string; photo?: string } = {},
) =>
  createStorageUnit({
    id: unitId(id),
    parentId: options.parentId ?? null,
    ownerId: options.owner === undefined ? null : userId(options.owner),
    name: id,
    kind: StorageUnitKind.BOX,
    photoId: options.photo === undefined ? null : photoId(options.photo),
    publicId: publicId(`PUB-${id}`),
    now: NOW,
  });

/**
 * Ana's garage has its own picture and holds a drill with one; Bea's flat
 * holds a scarf with one. One photo shows nothing at all any more.
 */
describe("photos a person may see (ADR 26)", () => {
  let storageUnits: InMemoryStorageUnitRepository;
  let items: InMemoryItemRepository;
  let photos: InMemoryPhotoRepository;

  const accessOf = async (who: string, shared: readonly string[] = []): Promise<Access> =>
    resolveAccess({
      caller: { userId: userId(who), role: Role.USER },
      storageUnits: await storageUnits.findAll(),
      shares: shared.map((id) => ({
        storageUnitId: unitId(id),
        userId: userId(who),
        access: ShareLevel.VIEW,
      })),
    });

  const EVERYTHING: Access = { kind: "everything" };

  beforeEach(async () => {
    storageUnits = new InMemoryStorageUnitRepository([
      aSpace("garage", { owner: "ana", photo: "garage-photo" }),
      aSpace("shelf", { parentId: unitId("garage") }),
      aSpace("flat", { owner: "bea" }),
    ]);
    items = new InMemoryItemRepository([
      createItem({
        id: itemId("drill"),
        storageUnitId: unitId("shelf"),
        name: "Drill",
        photos: [photoId("drill-photo")],
        now: NOW,
      }),
      createItem({
        id: itemId("scarf"),
        storageUnitId: unitId("flat"),
        name: "Scarf",
        photos: [photoId("scarf-photo")],
        now: NOW,
      }),
    ]);
    photos = new InMemoryPhotoRepository(
      ["garage-photo", "drill-photo", "scarf-photo", "loose-photo"].map(aPhoto),
    );
  });

  describe("one photo", () => {
    const find = (access: Access, id: string) =>
      new FindPhoto({ photos, items, storageUnits }).execute(access, photoId(id));

    it("is found when the person may see an item showing it", async () => {
      await expect(find(await accessOf("ana"), "drill-photo")).resolves.toMatchObject({
        id: "drill-photo",
      });
    });

    it("is found when the person may see the space it is the picture of", async () => {
      await expect(find(await accessOf("ana"), "garage-photo")).resolves.not.toBeNull();
    });

    it("is found through a share", async () => {
      await expect(
        find(await accessOf("bea", ["shelf"]), "drill-photo"),
      ).resolves.not.toBeNull();
    });

    it("does not exist for somebody who may see nothing showing it", async () => {
      await expect(find(await accessOf("bea"), "drill-photo")).resolves.toBeNull();
      await expect(find(await accessOf("bea"), "garage-photo")).resolves.toBeNull();
      await expect(find(await accessOf("ana"), "loose-photo")).resolves.toBeNull();
    });

    it("is found for an administrator wherever it is, even showing nothing", async () => {
      await expect(find(EVERYTHING, "scarf-photo")).resolves.not.toBeNull();
      await expect(find(EVERYTHING, "loose-photo")).resolves.not.toBeNull();
    });

    it("does not exist when nobody stored it", async () => {
      await expect(find(EVERYTHING, "never-stored")).resolves.toBeNull();
    });
  });

  describe("every photo", () => {
    const reach = (access: Access) =>
      new ReachablePhotos({ items, storageUnits }).execute(access);

    it("is what the spaces and items a person may see show", async () => {
      const reached = await reach(await accessOf("ana"));

      expect(reached.kind === "within" ? [...reached.photoIds].sort() : reached).toEqual([
        "drill-photo",
        "garage-photo",
      ]);
    });

    it("is everywhere for an administrator", async () => {
      await expect(reach(EVERYTHING)).resolves.toEqual({ kind: "everywhere" });
    });
  });

  describe("trying failed photos again", () => {
    const requeue = async (access: Access, ids: readonly string[]) =>
      new RequeuePhotos({ photos, items, storageUnits }).execute(
        access,
        ids.map(photoId),
      );

    it("requeues only the photos the person may see, and leaves the rest alone", async () => {
      const requeued = await requeue(await accessOf("bea"), ["scarf-photo", "drill-photo"]);

      expect(requeued.map((photo) => photo.id)).toEqual(["scarf-photo"]);
      expect((await photos.findById(photoId("scarf-photo")))?.processingStatus).toBe(
        PhotoProcessingStatus.PENDING,
      );
      expect((await photos.findById(photoId("drill-photo")))?.processingStatus).toBe(
        PhotoProcessingStatus.FAILED,
      );
    });

    it("requeues anything for an administrator", async () => {
      const requeued = await requeue(EVERYTHING, ["scarf-photo", "loose-photo"]);

      expect(requeued.map((photo) => photo.id).sort()).toEqual(["loose-photo", "scarf-photo"]);
    });
  });
});
