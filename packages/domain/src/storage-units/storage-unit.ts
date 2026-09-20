import type { PhotoId, PublicId, UnitId } from "../shared/identity.js";

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
 */
export interface StorageUnit {
  readonly id: UnitId;
  readonly parentId: UnitId | null;
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
  readonly name: string;
  readonly kind: StorageUnitKind;
  readonly description?: string | null;
  readonly photoId?: PhotoId | null;
  readonly publicId: PublicId;
  readonly now: Date;
}

export const createStorageUnit = (
  input: CreateStorageUnitInput,
): StorageUnit => ({
  id: input.id,
  parentId: input.parentId ?? null,
  name: input.name.trim(),
  kind: input.kind,
  description: input.description ?? null,
  photoId: input.photoId ?? null,
  publicId: input.publicId,
  createdAt: input.now,
  updatedAt: input.now,
});

/**
 * Returns a copy of the unit under a new parent. Whether the move is legal is
 * decided by the MoveStorageUnit use case, not here (ADR 2).
 */
export const reparentStorageUnit = (
  unit: StorageUnit,
  parentId: UnitId | null,
  now: Date,
): StorageUnit => ({
  ...unit,
  parentId,
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
