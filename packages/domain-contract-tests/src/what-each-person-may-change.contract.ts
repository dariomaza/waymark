import {
  AttachItemPhoto,
  CreateItem,
  CreateStorageUnit,
  createPhoto,
  CyclicStorageUnitMove,
  DeleteItem,
  DeleteStorageUnit,
  DetachItemPhoto,
  EmptyStorageUnit,
  InvalidQuantity,
  ItemNotFound,
  mayViewSpace,
  MissingEmptyTarget,
  MoveItems,
  MoveStorageUnit,
  OwnerOnly,
  PhotoProcessingStatus,
  ReorderItemPhotos,
  RequeuePhotos,
  Role,
  SetStorageUnitPhoto,
  ShareLevel,
  SpaceIsViewOnly,
  StorageUnitKind,
  StorageUnitNotEmpty,
  StorageUnitNotFound,
  UpdateItem,
  UpdateStorageUnit,
  markPhotoFailed,
  type Access,
  type ItemId,
  type Photo,
  type PhotoId,
  type UnitId,
  type UserId,
} from "@waymark/domain";
import {
  FakeClock,
  SequentialIdGenerator,
  SequentialPublicIdGenerator,
} from "@waymark/domain/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { A_MOMENT, aPhotoId, aStorageUnit, anItem } from "./builders.js";
import type { InvisibilityContext, RepositoryHarness } from "./harness.js";
import {
  accessIn,
  ADMIN,
  ANA,
  BEA,
  ITEMS,
  SPACES,
  seedHousehold,
} from "./invisibility.fixture.js";

/**
 * Where a write lands, as Bea sees it: a space of Ana's shared with nobody, the
 * garage shared with her to view, the attic shared with her to edit, and her
 * own flat.
 */
type Region = "unshared" | "view" | "edit" | "beas";

/**
 * One empty space in each region, so a write that needs a space to change or
 * to delete has one that holds nothing.
 */
const PLACES = {
  unshared: aStorageUnit("ana-safe-drawer", {
    name: "Ana safe drawer",
    parentId: SPACES.safe.id,
  }),
  view: aStorageUnit("ana-shelf-tray", {
    name: "Ana shelf tray",
    parentId: SPACES.shelf.id,
  }),
  edit: aStorageUnit("ana-attic-trunk", {
    name: "Ana attic trunk",
    parentId: SPACES.attic.id,
  }),
  beas: aStorageUnit("bea-wardrobe-box", {
    name: "Bea wardrobe box",
    parentId: SPACES.wardrobe.id,
  }),
} as const satisfies Record<Region, unknown>;

/** The space each region's place sits in, which is also in that region. */
const PARENTS: Record<Region, UnitId> = {
  unshared: SPACES.safe.id,
  view: SPACES.shelf.id,
  edit: SPACES.attic.id,
  beas: SPACES.wardrobe.id,
};

/** One item in each region, each holding one photo. */
const THINGS: Record<Region, { readonly id: ItemId; readonly photoId: PhotoId }> = {
  unshared: { id: ITEMS.passport.id, photoId: aPhotoId("photo-of-the-passport") },
  view: { id: ITEMS.drill.id, photoId: aPhotoId("photo-of-the-drill") },
  edit: { id: ITEMS.lamp.id, photoId: aPhotoId("photo-of-the-lamp") },
  beas: { id: ITEMS.scarf.id, photoId: aPhotoId("photo-of-the-scarf") },
};

type Person = "ana" | "bea" | "admin";

const PEOPLE: Record<Person, { readonly id: UserId; readonly role: Role }> = {
  ana: { id: ANA, role: Role.USER },
  bea: { id: BEA, role: Role.USER },
  admin: { id: ADMIN, role: Role.ADMINISTRATOR },
};

/** What a write must come to, for one person in one region. */
type Outcome = "unseen" | "view-only" | "done";

/**
 * Every cell the brief names: Bea is refused as if the unshared space did not
 * exist, refused for authority on the view share, and allowed on the edit
 * share and at home; Ana may change her own; the administrator may change
 * anything anywhere.
 */
const CELLS: readonly (readonly [Person, Region, Outcome])[] = [
  ["bea", "unshared", "unseen"],
  ["bea", "view", "view-only"],
  ["bea", "edit", "done"],
  ["bea", "beas", "done"],
  ["ana", "unshared", "done"],
  ["ana", "beas", "unseen"],
  ["admin", "unshared", "done"],
  ["admin", "view", "done"],
  ["admin", "edit", "done"],
  ["admin", "beas", "done"],
];

/**
 * # Something you may see but not change refuses to change (ADR 26)
 *
 * Every write use case, against the invisibility fixture, as each person in
 * the household. A space out of reach is refused exactly as a missing one is,
 * a space shared to view is refused for authority, and both refusals come
 * before every refusal the domain would otherwise make, so not even a "this
 * box is not empty" can confirm that a box exists.
 */
export const whatEachPersonMayChangeContract = (
  harness: RepositoryHarness<InvisibilityContext>,
): void => {
  describe(`What each person may change (${harness.name})`, () => {
    let context: InvisibilityContext;
    const clock = new FakeClock(A_MOMENT);

    const accessOf = (person: Person): Promise<Access> =>
      accessIn(context, PEOPLE[person].id, PEOPLE[person].role);

    const aStoredPhoto = async (id: string): Promise<Photo> => {
      const photo = createPhoto({
        id: aPhotoId(id),
        originalPath: `cd/${id}.jpg`,
        thumbnailPath: `cd/${id}.thumb.jpg`,
      });
      await context.photos.save(photo);

      return photo;
    };

    const use = () => {
      const { storageUnits, items, photos } = context;
      const ids = new SequentialIdGenerator("written");

      return {
        createStorageUnit: new CreateStorageUnit({
          storageUnits,
          ids,
          publicIds: new SequentialPublicIdGenerator(),
          clock,
        }),
        updateStorageUnit: new UpdateStorageUnit({ storageUnits, clock }),
        moveStorageUnit: new MoveStorageUnit({ storageUnits, clock }),
        emptyStorageUnit: new EmptyStorageUnit({ storageUnits, items, clock }),
        deleteStorageUnit: new DeleteStorageUnit({ storageUnits, items }),
        createItem: new CreateItem({ items, storageUnits, ids, clock }),
        updateItem: new UpdateItem({ items, clock }),
        moveItems: new MoveItems({ items, storageUnits, clock }),
        deleteItem: new DeleteItem({ items }),
        attachItemPhoto: new AttachItemPhoto({ items, photos, clock }),
        detachItemPhoto: new DetachItemPhoto({ items, clock }),
        reorderItemPhotos: new ReorderItemPhotos({ items, clock }),
        setStorageUnitPhoto: new SetStorageUnitPhoto({ storageUnits, photos, clock }),
        requeuePhotos: new RequeuePhotos({ photos, items, storageUnits }),
      };
    };

    beforeEach(async () => {
      context = await harness.setUp();
      await seedHousehold(context);
      for (const place of Object.values(PLACES)) {
        await context.storageUnits.save(place);
      }
      await aStoredPhoto("photo-of-the-lamp");
      await context.items.save({ ...ITEMS.lamp, photos: [THINGS.edit.photoId] });
    });

    afterEach(async () => {
      await harness.tearDown();
    });

    /**
     * An edit share inside the garage Bea may only view: she may change the
     * tray and what it holds, and still not the shelf it stands on.
     */
    const shareTheTrayWithBeaToEdit = (): Promise<void> =>
      context.shares.set({ storageUnitId: PLACES.view.id, userId: BEA, access: ShareLevel.EDIT });

    const whereIs = async (id: UnitId): Promise<UnitId | null> =>
      (await context.storageUnits.findById(id))?.parentId ?? null;

    const itemIsIn = async (id: ItemId): Promise<UnitId | undefined> =>
      (await context.items.findById(id))?.storageUnitId;

    /**
     * One write, aimed at one region. `unseen` is what a missing id of the
     * same kind is refused with, so an unseen target can be compared with it.
     */
    interface Write {
      readonly act: (access: Access, who: UserId, region: Region) => Promise<unknown>;
      readonly unseen: new (...args: never[]) => Error;
      /** The space whose view share refuses the write, when it is not the place. */
      readonly blockedBy?: (region: Region) => UnitId;
    }

    const WRITES: Record<string, Write> = {
      "create a space inside": {
        act: (access, who, region) =>
          use().createStorageUnit.execute(access, {
            callerId: who,
            parentId: PLACES[region].id,
            name: "New box",
            kind: StorageUnitKind.BOX,
          }),
        unseen: StorageUnitNotFound,
      },
      "create an item inside": {
        act: (access, _who, region) =>
          use().createItem.execute(access, {
            storageUnitId: PLACES[region].id,
            name: "New thing",
          }),
        unseen: StorageUnitNotFound,
      },
      "edit a space": {
        act: (access, _who, region) =>
          use().updateStorageUnit.execute(access, { id: PLACES[region].id, name: "Renamed" }),
        unseen: StorageUnitNotFound,
      },
      "edit an item": {
        act: (access, _who, region) =>
          use().updateItem.execute(access, { id: THINGS[region].id, name: "Renamed" }),
        unseen: ItemNotFound,
        blockedBy: (region) => PARENTS[region],
      },
      "delete a space": {
        act: (access, _who, region) =>
          use().deleteStorageUnit.execute(access, PLACES[region].id),
        unseen: StorageUnitNotFound,
      },
      "delete an item": {
        act: (access, _who, region) => use().deleteItem.execute(access, THINGS[region].id),
        unseen: ItemNotFound,
        blockedBy: (region) => PARENTS[region],
      },
      "empty a space into its parent": {
        act: async (access, who, region) => {
          await context.items.save(anItem(`kept-in-${region}`, PLACES[region].id));

          return use().emptyStorageUnit.execute(access, {
            callerId: who,
            id: PLACES[region].id,
          });
        },
        unseen: StorageUnitNotFound,
      },
      "move a space within the same region": {
        act: (access, who, region) =>
          use().moveStorageUnit.execute(access, {
            callerId: who,
            id: PLACES[region].id,
            targetParentId: PARENTS[region],
          }),
        unseen: StorageUnitNotFound,
      },
      "move an item within the same region": {
        act: (access, _who, region) =>
          use().moveItems.execute(access, {
            itemIds: [THINGS[region].id],
            targetUnitId: PLACES[region].id,
          }),
        unseen: StorageUnitNotFound,
      },
      "add a photo to an item": {
        act: async (access, _who, region) =>
          use().attachItemPhoto.execute(access, {
            itemId: THINGS[region].id,
            photo: createPhoto({
              id: aPhotoId(`another-of-${region}`),
              originalPath: "ef/another.jpg",
              thumbnailPath: "ef/another.thumb.jpg",
            }),
          }),
        unseen: ItemNotFound,
        blockedBy: (region) => PARENTS[region],
      },
      "take a photo off an item": {
        act: (access, _who, region) =>
          use().detachItemPhoto.execute(access, {
            itemId: THINGS[region].id,
            photoId: THINGS[region].photoId,
          }),
        unseen: ItemNotFound,
        blockedBy: (region) => PARENTS[region],
      },
      "choose an item's cover": {
        act: (access, _who, region) =>
          use().reorderItemPhotos.execute(access, {
            itemId: THINGS[region].id,
            photoIds: [THINGS[region].photoId],
          }),
        unseen: ItemNotFound,
        blockedBy: (region) => PARENTS[region],
      },
      "give a space a photo": {
        act: async (access, _who, region) =>
          use().setStorageUnitPhoto.execute(access, {
            unitId: PLACES[region].id,
            photo: createPhoto({
              id: aPhotoId(`picture-of-${region}`),
              originalPath: "ef/picture.jpg",
              thumbnailPath: "ef/picture.thumb.jpg",
            }),
          }),
        unseen: StorageUnitNotFound,
      },
      "take a space's photo away": {
        act: (access, _who, region) =>
          use().setStorageUnitPhoto.execute(access, { unitId: PLACES[region].id, photo: null }),
        unseen: StorageUnitNotFound,
      },
    };

    /**
     * A write aimed at a space, or into one, is stopped by that space; a write
     * aimed at an item is stopped by the space holding it.
     */
    const blockingSpaceOf = (write: Write, region: Region): UnitId =>
      write.blockedBy?.(region) ?? PLACES[region].id;

    describe.each(Object.entries(WRITES))("to %s", (_name, write) => {
      it.each(CELLS)("as %s, in the %s region: %s", async (person, region, outcome) => {
        const attempt = write.act(await accessOf(person), PEOPLE[person].id, region);

        if (outcome === "unseen") {
          await expect(attempt).rejects.toBeInstanceOf(write.unseen);
        } else if (outcome === "view-only") {
          await expect(attempt).rejects.toEqual(
            new SpaceIsViewOnly(blockingSpaceOf(write, region)),
          );
        } else {
          await expect(attempt.then(() => "done")).resolves.toBe("done");
        }
      });
    });

    describe("a refusal never reveals what may not be seen", () => {
      it("answers Bea's delete of Ana's full safe as a missing space, not as one that is not empty", async () => {
        await expect(
          use().deleteStorageUnit.execute(await accessOf("bea"), SPACES.safe.id),
        ).rejects.toBeInstanceOf(StorageUnitNotFound);
      });

      it("answers Bea's delete of the full garage she may only view as view only, not as not empty", async () => {
        await expect(
          use().deleteStorageUnit.execute(await accessOf("bea"), SPACES.garage.id),
        ).rejects.toEqual(new SpaceIsViewOnly(SPACES.garage.id));
      });

      it("still tells Ana her own safe is not empty", async () => {
        await expect(
          use().deleteStorageUnit.execute(await accessOf("ana"), SPACES.safe.id),
        ).rejects.toBeInstanceOf(StorageUnitNotEmpty);
      });

      it("refuses a cycle inside the view share as view only, before the cycle", async () => {
        await expect(
          use().moveStorageUnit.execute(await accessOf("bea"), {
            callerId: BEA,
            id: SPACES.shelf.id,
            targetParentId: PLACES.view.id,
          }),
        ).rejects.toEqual(new SpaceIsViewOnly(SPACES.shelf.id));
      });

      it("still refuses Bea a cycle inside the attic she may edit", async () => {
        await expect(
          use().moveStorageUnit.execute(await accessOf("bea"), {
            callerId: BEA,
            id: PLACES.edit.id,
            targetParentId: PLACES.edit.id,
          }),
        ).rejects.toBeInstanceOf(CyclicStorageUnitMove);
      });

      it("refuses a bad quantity in the view share as view only, before the quantity", async () => {
        await expect(
          use().updateItem.execute(await accessOf("bea"), {
            id: ITEMS.drill.id,
            quantity: 0,
          }),
        ).rejects.toEqual(new SpaceIsViewOnly(SPACES.shelf.id));
        await expect(
          use().updateItem.execute(await accessOf("bea"), { id: ITEMS.lamp.id, quantity: 0 }),
        ).rejects.toBeInstanceOf(InvalidQuantity);
      });

      it("answers an unseen place to empty into as a missing one, before anything else", async () => {
        await expect(
          use().emptyStorageUnit.execute(await accessOf("bea"), {
            callerId: BEA,
            id: SPACES.garage.id,
            targetUnitId: SPACES.safe.id,
          }),
        ).rejects.toEqual(new StorageUnitNotFound(SPACES.safe.id));
      });
    });

    describe("moving between places", () => {
      it("lets Bea take a lamp out of the attic she may edit and into her own wardrobe", async () => {
        await use().moveItems.execute(await accessOf("bea"), {
          itemIds: [ITEMS.lamp.id],
          targetUnitId: SPACES.wardrobe.id,
        });

        expect(await itemIsIn(ITEMS.lamp.id)).toBe(SPACES.wardrobe.id);
      });

      it("lets Bea take a trunk out of the attic into her flat, which makes it hers", async () => {
        await use().moveStorageUnit.execute(await accessOf("bea"), {
          callerId: BEA,
          id: PLACES.edit.id,
          targetParentId: SPACES.flat.id,
        });

        expect(await whereIs(PLACES.edit.id)).toBe(SPACES.flat.id);
        expect(mayViewSpace(await accessOf("ana"), PLACES.edit.id)).toBe(false);
      });

      it.each([
        ["into the garage she may only view", SPACES.garage.id, new SpaceIsViewOnly(SPACES.garage.id)],
        ["into Ana's safe", SPACES.safe.id, new StorageUnitNotFound(SPACES.safe.id)],
      ])("refuses Bea moving her scarf %s", async (_where, target, refusal) => {
        await expect(
          use().moveItems.execute(await accessOf("bea"), {
            itemIds: [ITEMS.scarf.id],
            targetUnitId: target,
          }),
        ).rejects.toEqual(refusal);
        expect(await itemIsIn(ITEMS.scarf.id)).toBe(SPACES.wardrobe.id);
      });

      it.each([
        ["into the garage she may only view", SPACES.garage.id, new SpaceIsViewOnly(SPACES.garage.id)],
        ["into Ana's safe", SPACES.safe.id, new StorageUnitNotFound(SPACES.safe.id)],
      ])("refuses Bea moving her box %s", async (_where, target, refusal) => {
        await expect(
          use().moveStorageUnit.execute(await accessOf("bea"), {
            callerId: BEA,
            id: PLACES.beas.id,
            targetParentId: target,
          }),
        ).rejects.toEqual(refusal);
        expect(await whereIs(PLACES.beas.id)).toBe(SPACES.wardrobe.id);
      });

      it("refuses Bea taking the drill out of the shelf she may only view", async () => {
        await expect(
          use().moveItems.execute(await accessOf("bea"), {
            itemIds: [ITEMS.drill.id],
            targetUnitId: SPACES.wardrobe.id,
          }),
        ).rejects.toEqual(new SpaceIsViewOnly(SPACES.shelf.id));
      });

      it("refuses Bea taking the tray out of the shelf she may only view", async () => {
        await expect(
          use().moveStorageUnit.execute(await accessOf("bea"), {
            callerId: BEA,
            id: PLACES.view.id,
            targetParentId: SPACES.flat.id,
          }),
        ).rejects.toEqual(new SpaceIsViewOnly(PLACES.view.id));
      });

      it("answers Bea moving Ana's drawer into her own box as if the drawer did not exist", async () => {
        await expect(
          use().moveStorageUnit.execute(await accessOf("bea"), {
            callerId: BEA,
            id: PLACES.unshared.id,
            targetParentId: PLACES.beas.id,
          }),
        ).rejects.toEqual(new StorageUnitNotFound(PLACES.unshared.id));
      });

      it("refuses Bea taking a tray she may edit out of the shelf she may only view", async () => {
        await shareTheTrayWithBeaToEdit();

        await expect(
          use().moveStorageUnit.execute(await accessOf("bea"), {
            callerId: BEA,
            id: PLACES.view.id,
            targetParentId: SPACES.flat.id,
          }),
        ).rejects.toEqual(new SpaceIsViewOnly(SPACES.shelf.id));
        expect(await whereIs(PLACES.view.id)).toBe(SPACES.shelf.id);
      });

      it("refuses Bea taking the attic itself away, without naming the house above it", async () => {
        await expect(
          use().moveStorageUnit.execute(await accessOf("bea"), {
            callerId: BEA,
            id: SPACES.attic.id,
            targetParentId: SPACES.flat.id,
          }),
        ).rejects.toEqual(new OwnerOnly(SPACES.attic.id));
        expect(await whereIs(SPACES.attic.id)).toBe(SPACES.house.id);
      });
    });

    describe("making a root", () => {
      it("refuses Bea turning the trunk in the attic she may edit into a root", async () => {
        await expect(
          use().moveStorageUnit.execute(await accessOf("bea"), {
            callerId: BEA,
            id: PLACES.edit.id,
            targetParentId: null,
          }),
        ).rejects.toEqual(new OwnerOnly(PLACES.edit.id));
        expect(await whereIs(PLACES.edit.id)).toBe(SPACES.attic.id);
      });

      it.each([["ana"], ["admin"]] as const)(
        "lets %s turn the trunk into a root, which stays Ana's",
        async (person) => {
          const moved = await use().moveStorageUnit.execute(await accessOf(person), {
            callerId: PEOPLE[person].id,
            id: PLACES.edit.id,
            targetParentId: null,
          });

          expect(moved.parentId).toBeNull();
          expect(moved.ownerId).toBe(ANA);
        },
      );

      it("lets Bea turn a box of her own into a root of her own", async () => {
        const moved = await use().moveStorageUnit.execute(await accessOf("bea"), {
          callerId: BEA,
          id: PLACES.beas.id,
          targetParentId: null,
        });

        expect(moved.ownerId).toBe(BEA);
      });

      it("refuses Bea emptying the attic out of her sight, which would make its trunk a root", async () => {
        await expect(
          use().emptyStorageUnit.execute(await accessOf("bea"), {
            callerId: BEA,
            id: SPACES.attic.id,
          }),
        ).rejects.toEqual(new OwnerOnly(SPACES.attic.id));
        expect(await whereIs(PLACES.edit.id)).toBe(SPACES.attic.id);
      });

      it("asks Bea where to put what the attic holds, once it holds no space", async () => {
        await context.storageUnits.save({ ...PLACES.edit, parentId: SPACES.flat.id });

        await expect(
          use().emptyStorageUnit.execute(await accessOf("bea"), {
            callerId: BEA,
            id: SPACES.attic.id,
          }),
        ).rejects.toBeInstanceOf(MissingEmptyTarget);
        expect(await itemIsIn(ITEMS.lamp.id)).toBe(SPACES.attic.id);
      });

      it("refuses Bea emptying the trunk into the garage she may only view", async () => {
        await context.items.save(anItem("kept-in-the-trunk", PLACES.edit.id));

        await expect(
          use().emptyStorageUnit.execute(await accessOf("bea"), {
            callerId: BEA,
            id: PLACES.edit.id,
            targetUnitId: SPACES.garage.id,
          }),
        ).rejects.toEqual(new SpaceIsViewOnly(SPACES.garage.id));
      });

      it("refuses Bea emptying a tray she may edit into the shelf she may only view", async () => {
        await shareTheTrayWithBeaToEdit();
        await context.items.save(anItem("kept-in-the-tray", PLACES.view.id));

        await expect(
          use().emptyStorageUnit.execute(await accessOf("bea"), {
            callerId: BEA,
            id: PLACES.view.id,
          }),
        ).rejects.toEqual(new SpaceIsViewOnly(SPACES.shelf.id));
        expect(await itemIsIn(anItem("kept-in-the-tray", PLACES.view.id).id)).toBe(
          PLACES.view.id,
        );
      });

      it("lets Bea empty the attic into her own wardrobe", async () => {
        await use().emptyStorageUnit.execute(await accessOf("bea"), {
          callerId: BEA,
          id: SPACES.attic.id,
          targetUnitId: SPACES.wardrobe.id,
        });

        expect(await itemIsIn(ITEMS.lamp.id)).toBe(SPACES.wardrobe.id);
        expect(await whereIs(PLACES.edit.id)).toBe(SPACES.wardrobe.id);
      });

      it("lets Bea empty her own flat, its wardrobe becoming a root of hers", async () => {
        const result = await use().emptyStorageUnit.execute(await accessOf("bea"), {
          callerId: BEA,
          id: SPACES.flat.id,
        });

        expect(result.movedChildUnits).toEqual([
          expect.objectContaining({ id: SPACES.wardrobe.id, parentId: null, ownerId: BEA }),
        ]);
      });
    });

    describe("a move of several items at once", () => {
      const moveAsBea = async (itemIds: readonly ItemId[], targetUnitId: UnitId) =>
        use().moveItems.execute(await accessOf("bea"), { itemIds, targetUnitId });

      it("moves nothing when one of the items is out of sight", async () => {
        await expect(
          moveAsBea([ITEMS.scarf.id, ITEMS.lamp.id, ITEMS.passport.id], PLACES.beas.id),
        ).rejects.toEqual(new ItemNotFound(ITEMS.passport.id));
        expect(await itemIsIn(ITEMS.scarf.id)).toBe(SPACES.wardrobe.id);
        expect(await itemIsIn(ITEMS.lamp.id)).toBe(SPACES.attic.id);
      });

      it("moves nothing when one of the items may only be viewed", async () => {
        await expect(
          moveAsBea([ITEMS.scarf.id, ITEMS.drill.id], PLACES.beas.id),
        ).rejects.toEqual(new SpaceIsViewOnly(SPACES.shelf.id));
        expect(await itemIsIn(ITEMS.scarf.id)).toBe(SPACES.wardrobe.id);
      });

      it("answers an unseen item before a view-only one, whatever their order", async () => {
        await expect(
          moveAsBea([ITEMS.drill.id, ITEMS.passport.id], PLACES.beas.id),
        ).rejects.toEqual(new ItemNotFound(ITEMS.passport.id));
      });

      it("answers an unseen destination before a view-only item", async () => {
        await expect(moveAsBea([ITEMS.drill.id], SPACES.safe.id)).rejects.toEqual(
          new StorageUnitNotFound(SPACES.safe.id),
        );
      });

      it("moves everything when Bea may edit both ends of every item", async () => {
        await moveAsBea([ITEMS.scarf.id, ITEMS.lamp.id], PLACES.edit.id);

        expect(await itemIsIn(ITEMS.scarf.id)).toBe(PLACES.edit.id);
        expect(await itemIsIn(ITEMS.lamp.id)).toBe(PLACES.edit.id);
      });
    });

    describe("trying a photo's background removal again", () => {
      const failAll = async (): Promise<void> => {
        for (const region of Object.keys(THINGS) as Region[]) {
          const photo = await context.photos.findById(THINGS[region].photoId);
          if (photo !== null) {
            await context.photos.save(markPhotoFailed(photo));
          }
        }
      };

      it.each(CELLS)("for one photo, as %s, in the %s region: %s", async (person, region, outcome) => {
        await failAll();
        const attempt = use().requeuePhotos.one(
          await accessOf(person),
          THINGS[region].photoId,
        );

        if (outcome === "unseen") {
          await expect(attempt).resolves.toBeNull();
        } else if (outcome === "view-only") {
          await expect(attempt).rejects.toEqual(new SpaceIsViewOnly(PARENTS[region]));
        } else {
          await expect(attempt).resolves.toMatchObject({
            processingStatus: PhotoProcessingStatus.PENDING,
          });
        }
      });

      it("requeues for Bea, in bulk, only the photos she may change", async () => {
        await failAll();

        const requeued = await use().requeuePhotos.execute(
          await accessOf("bea"),
          Object.values(THINGS).map((thing) => thing.photoId),
        );

        expect(requeued.map((photo) => photo.id).sort()).toEqual(
          [THINGS.edit.photoId, THINGS.beas.photoId].sort(),
        );
        expect((await context.photos.findById(THINGS.view.photoId))?.processingStatus).toBe(
          PhotoProcessingStatus.FAILED,
        );
      });
    });
  });
};
