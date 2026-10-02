import {
  createPhoto,
  resolveAccess,
  Role,
  ShareLevel,
  unitId,
  userId,
  type Access,
  type UserId,
} from "@waymark/domain";

import { AN_OWNER, ANOTHER_OWNER, aPhotoId, aStorageUnit, anItem } from "./builders.js";
import type { InvisibilityContext } from "./harness.js";

/**
 * # One household, for every rule about who may see and change what (ADR 26)
 *
 * The read suite and the write suite are held to the same fixture, so a
 * space that one of them treats as unseen is unseen to the other as well.
 */

/** Ana owns a house; Bea owns a flat. Neither is an administrator. */
export const ANA: UserId = AN_OWNER;
export const BEA: UserId = ANOTHER_OWNER;
/** Owns nothing. An administrator's reach does not depend on owning. */
export const ADMIN: UserId = userId("contract-administrator");

/**
 * The one fixture every read and every write is held to (ADR 26).
 *
 * Ana's house holds a garage shared with Bea to view, an attic shared with
 * Bea to edit, and a safe shared with nobody. The house itself is not shared,
 * so for Bea the garage and the attic are roots and the house's name must
 * never appear. Bea's flat is hers alone.
 */
export const SPACES = {
  house: aStorageUnit("ana-house", { name: "Ana house", ownerId: ANA }),
  garage: aStorageUnit("ana-garage", {
    name: "Ana garage",
    parentId: unitId("ana-house"),
  }),
  shelf: aStorageUnit("ana-shelf", { name: "Ana shelf", parentId: unitId("ana-garage") }),
  attic: aStorageUnit("ana-attic", { name: "Ana attic", parentId: unitId("ana-house") }),
  safe: aStorageUnit("ana-safe", {
    name: "Ana safe",
    parentId: unitId("ana-house"),
    photoId: aPhotoId("photo-of-the-safe"),
  }),
  jewels: aStorageUnit("ana-jewels", {
    name: "Ana jewel box",
    parentId: unitId("ana-safe"),
  }),
  flat: aStorageUnit("bea-flat", { name: "Bea flat", ownerId: BEA }),
  wardrobe: aStorageUnit("bea-wardrobe", {
    name: "Bea wardrobe",
    parentId: unitId("bea-flat"),
  }),
} as const;

export const ITEMS = {
  tent: anItem("ana-tent", SPACES.house.id, { name: "Ana tent" }),
  drill: anItem("ana-drill", SPACES.shelf.id, {
    name: "Ana drill",
    photos: [aPhotoId("photo-of-the-drill")],
  }),
  lamp: anItem("ana-lamp", SPACES.attic.id, { name: "Ana lamp" }),
  passport: anItem("ana-passport", SPACES.safe.id, {
    name: "Ana passport",
    photos: [aPhotoId("photo-of-the-passport")],
  }),
  ring: anItem("ana-ring", SPACES.jewels.id, { name: "Ana ring" }),
  scarf: anItem("bea-scarf", SPACES.wardrobe.id, {
    name: "Bea scarf",
    photos: [aPhotoId("photo-of-the-scarf")],
  }),
} as const;

export const PHOTOS = [
  "photo-of-the-drill",
  "photo-of-the-passport",
  "photo-of-the-safe",
  "photo-of-the-scarf",
];

export const ANAS_SPACES = ["ana-attic", "ana-garage", "ana-house", "ana-jewels", "ana-safe", "ana-shelf"];
export const BEAS_SPACES = ["bea-flat", "bea-wardrobe"];
/** What is shared with Bea, and everything under it. */
export const SHARED_WITH_BEA = ["ana-attic", "ana-garage", "ana-shelf"];

/** Every name Bea must never read, wherever an answer might carry it. */
export const NAMES_HIDDEN_FROM_BEA = [
  "Ana house",
  "Ana safe",
  "Ana jewel box",
  "Ana tent",
  "Ana passport",
  "Ana ring",
];

/** Every name of Bea's, which Ana must never read. */
export const BEAS_NAMES = ["Bea flat", "Bea wardrobe", "Bea scarf"];

export const ANAS_ITEMS = ["ana-drill", "ana-lamp", "ana-passport", "ana-ring", "ana-tent"];
/** What Bea may see of Ana's things: what the garage and the attic hold. */
export const ANAS_ITEMS_SHARED_WITH_BEA = ["ana-drill", "ana-lamp"];

/** The names an answer carries, wherever in it they are. */
export const namesIn = (answer: unknown, among: readonly string[]): string[] => {
  const text = JSON.stringify(answer);

  return among.filter((name) => text.includes(name));
};

export const sortedIdsOf = (entities: readonly { readonly id: string }[]): string[] =>
  entities.map((entity) => entity.id).sort();


/**
 * Stores the household through the real repositories, roots first so a
 * relational adapter's parent keys are satisfiable, and shares the garage with
 * Bea to view and the attic with Bea to edit.
 */
export const seedHousehold = async (context: InvisibilityContext): Promise<void> => {
  for (const unit of Object.values(SPACES)) {
    await context.storageUnits.save(unit);
  }
  await context.items.saveAll(Object.values(ITEMS));
  for (const id of PHOTOS) {
    await context.photos.save(
      createPhoto({
        id: aPhotoId(id),
        originalPath: `ab/${id}.jpg`,
        thumbnailPath: `ab/${id}.thumb.jpg`,
      }),
    );
  }
  await context.shares.set({
    storageUnitId: SPACES.garage.id,
    userId: BEA,
    access: ShareLevel.VIEW,
  });
  await context.shares.set({
    storageUnitId: SPACES.attic.id,
    userId: BEA,
    access: ShareLevel.EDIT,
  });
};

/** What a person may reach right now, resolved from what is stored. */
export const accessIn = async (
  context: InvisibilityContext,
  who: UserId,
  role: Role = Role.USER,
): Promise<Access> =>
  resolveAccess({
    caller: { userId: who, role },
    storageUnits: await context.storageUnits.findAll(),
    shares: await context.shares.findAll(),
  });
