import type { PhotoId, PublicId, UnitId, UserId } from "../shared/identity.js";

/**
 * Presentational and filtering hint only. Nesting is never constrained by kind
 * (ADR 1): a box may sit inside a room, a shelf or another box.
 */
export const StorageUnitKind = {
  ROOM: "ROOM",
  FURNITURE: "FURNITURE",
  SHELF: "SHELF",
  DRAWER: "DRAWER",
  BOX: "BOX",
  BAG: "BAG",
  OTHER: "OTHER",
} as const;

export type StorageUnitKind =
  (typeof StorageUnitKind)[keyof typeof StorageUnitKind];

/**
 * A place that holds items and other storage units. Location is not an
 * attribute: a `null` parent means a root, and the location of a unit is the
 * computed path to its root (ADR 1).
 *
 * `ownerId` is set on a root and on nothing else (ADR 26): everything below a
 * root belongs to that root's owner through the tree, so ownership has one
 * source and moving a subtree carries it along with no extra writes.
 */
export interface StorageUnit {
  readonly id: UnitId;
  readonly parentId: UnitId | null;
  readonly ownerId: UserId | null;
  readonly name: string;
  readonly kind: StorageUnitKind;
  readonly description: string | null;
  readonly photoId: PhotoId | null;
  readonly publicId: PublicId;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateStorageUnitInput {
  readonly id: UnitId;
  readonly parentId?: UnitId | null;
  /** Kept on a root only; a space inside another belongs to its root's owner. */
  readonly ownerId?: UserId | null;
  readonly name: string;
  readonly kind: StorageUnitKind;
  readonly description?: string | null;
  readonly photoId?: PhotoId | null;
  readonly publicId: PublicId;
  readonly now: Date;
}

export const createStorageUnit = (
  input: CreateStorageUnitInput,
): StorageUnit => {
  const parentId = input.parentId ?? null;

  return {
    id: input.id,
    parentId,
    ownerId: parentId === null ? (input.ownerId ?? null) : null,
    name: input.name.trim(),
    kind: input.kind,
    description: input.description ?? null,
    photoId: input.photoId ?? null,
    publicId: input.publicId,
    createdAt: input.now,
    updatedAt: input.now,
  };
};

/**
 * Where a unit is put: inside another space, or at the top as a root, which
 * cannot be said without saying whose root it is (ADR 26).
 */
export type StorageUnitPlacement =
  | { readonly parentId: UnitId }
  | { readonly parentId: null; readonly ownerId: UserId };

/**
 * Returns a copy of the unit in a new place. Whether the move is legal is
 * decided by the use case, not here (ADR 2). A unit put inside another space
 * stops recording an owner, because it now belongs to that space's root.
 */
export const reparentStorageUnit = (
  unit: StorageUnit,
  placement: StorageUnitPlacement,
  now: Date,
): StorageUnit => ({
  ...unit,
  parentId: placement.parentId,
  ownerId: placement.parentId === null ? placement.ownerId : null,
  updatedAt: now,
});

/**
 * What an edit of a storage unit may say. Every field is optional, and an
 * absent one means "leave it alone" — which is different from `null`, the only
 * way to take a description off.
 *
 * `parentId` is not here, and that is the whole design of this type. Moving a
 * unit is guarded by the subtree invariant (ADR 2) and has a use case of its
 * own whose name says so. Folding it into a general edit would hide the one
 * operation on a storage unit that can corrupt the tree behind a field that
 * looks exactly as innocent as a rename.
 *
 * `photoId` is absent for the same kind of reason: setting one is a file
 * lifecycle, and `SetStorageUnitPhoto` owns releasing whatever it replaced.
 */
export interface StorageUnitRevision {
  readonly name?: string;
  readonly kind?: StorageUnitKind;
  readonly description?: string | null;
}

/**
 * Returns a copy of the unit with whatever the revision names changed.
 *
 * Built field by field rather than by spreading the revision, so a property
 * that is not part of `StorageUnitRevision` cannot reach the stored unit even
 * if a caller with an `as never` and an opinion puts one there.
 */
export const reviseStorageUnit = (
  unit: StorageUnit,
  revision: StorageUnitRevision,
  now: Date,
): StorageUnit => ({
  ...unit,
  name: revision.name === undefined ? unit.name : revision.name.trim(),
  kind: revision.kind ?? unit.kind,
  description:
    revision.description === undefined ? unit.description : revision.description,
  updatedAt: now,
});

/**
 * Returns a copy of the unit pointing at a different photo, or at none.
 *
 * A unit holds exactly one photo id, so this is always a replacement; who owns
 * the files the old one left behind is decided by `SetStorageUnitPhoto`, not
 * here.
 */
export const setStorageUnitPhoto = (
  unit: StorageUnit,
  photoId: PhotoId | null,
  now: Date,
): StorageUnit => ({
  ...unit,
  photoId,
  updatedAt: now,
});
