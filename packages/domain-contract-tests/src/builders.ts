import {
  createItem,
  createStorageUnit,
  itemId,
  photoId,
  publicId,
  StorageUnitKind,
  unitId,
  userId,
  type Item,
  type PhotoId,
  type PublicId,
  type StorageUnit,
  type UnitId,
  type UserId,
} from "@waymark/domain";

/** A fixed instant with a non-zero millisecond part, so truncation shows up. */
export const A_MOMENT = new Date("2026-03-14T09:26:53.589Z");

/** A later instant, for asserting that updates actually move `updatedAt`. */
export const A_LATER_MOMENT = new Date("2026-05-01T18:04:11.017Z");

/** Whose a root is, unless a case says otherwise (ADR 26). */
export const AN_OWNER: UserId = userId("contract-owner");

/** A second person, for the cases about whose something is. */
export const ANOTHER_OWNER: UserId = userId("contract-other-owner");

/**
 * Everybody the contracts mention. A harness backed by a database must give
 * each of them an account in `setUp`, because a root's owner is a foreign key.
 */
export const CONTRACT_PEOPLE: readonly UserId[] = [AN_OWNER, ANOTHER_OWNER];

export interface StorageUnitOverrides {
  readonly parentId?: UnitId | null;
  /** Ignored below the top: a space inside another belongs to its root's owner. */
  readonly ownerId?: UserId;
  readonly name?: string;
  readonly kind?: StorageUnitKind;
  readonly description?: string | null;
  readonly photoId?: PhotoId | null;
  readonly publicId?: PublicId;
  readonly now?: Date;
}

export const aStorageUnit = (
  id: string,
  overrides: StorageUnitOverrides = {},
): StorageUnit =>
  createStorageUnit({
    id: unitId(id),
    parentId: overrides.parentId ?? null,
    ownerId: overrides.ownerId ?? AN_OWNER,
    name: overrides.name ?? `Unit ${id}`,
    kind: overrides.kind ?? StorageUnitKind.BOX,
    description: overrides.description ?? null,
    photoId: overrides.photoId ?? null,
    publicId: overrides.publicId ?? publicId(`PUB-${id.toUpperCase()}`),
    now: overrides.now ?? A_MOMENT,
  });

export interface ItemOverrides {
  readonly name?: string;
  readonly description?: string | null;
  readonly quantity?: number;
  readonly tags?: readonly string[];
  readonly photos?: readonly PhotoId[];
  readonly now?: Date;
}

export const anItem = (
  id: string,
  storageUnitId: UnitId,
  overrides: ItemOverrides = {},
): Item =>
  createItem({
    id: itemId(id),
    storageUnitId,
    name: overrides.name ?? `Item ${id}`,
    description: overrides.description ?? null,
    quantity: overrides.quantity ?? 1,
    tags: overrides.tags ?? [],
    photos: overrides.photos ?? [],
    now: overrides.now ?? A_MOMENT,
  });

/**
 * Builds a straight chain of units, root first, each one the parent of the
 * next. Returned in the same order.
 */
export const aChainOfStorageUnits = (
  ...ids: readonly string[]
): StorageUnit[] => {
  const chain: StorageUnit[] = [];
  let parentId: UnitId | null = null;

  for (const id of ids) {
    const unit = aStorageUnit(id, { parentId });
    chain.push(unit);
    parentId = unit.id;
  }

  return chain;
};

export const aPhotoId = (value: string): PhotoId => photoId(value);

export const aUnitId = (value: string): UnitId => unitId(value);

export const anItemId = (value: string) => itemId(value);

/** Ids are unordered in storage, so set-like assertions compare sorted ids. */
export const sortedIds = (
  entities: readonly { readonly id: string }[],
): string[] => entities.map((entity) => entity.id).sort();
