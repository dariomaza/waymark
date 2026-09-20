import {
  StorageUnitKind,
  photoId,
  publicId,
  unitId,
  type StorageUnit,
} from "@ariadna/domain";
import type { StorageUnit as StorageUnitRow } from "@prisma/client";

import { UnknownStorageUnitKind } from "./persistence-errors.js";

const KNOWN_KINDS = new Set<string>(Object.values(StorageUnitKind));

/** The column is a plain string, so it is checked rather than trusted. */
export const toStorageUnitKind = (value: string): StorageUnitKind => {
  if (!KNOWN_KINDS.has(value)) {
    throw new UnknownStorageUnitKind(value);
  }

  return value as StorageUnitKind;
};

export const toDomainStorageUnit = (row: StorageUnitRow): StorageUnit => ({
  id: unitId(row.id),
  parentId: row.parentId === null ? null : unitId(row.parentId),
  name: row.name,
  kind: toStorageUnitKind(row.kind),
  description: row.description,
  photoId: row.photoId === null ? null : photoId(row.photoId),
  publicId: publicId(row.publicId),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/**
 * The full row, used for both halves of an upsert: a save is a statement about
 * the whole unit, never a patch, so `create` and `update` take the same shape.
 */
export const toStorageUnitRow = (unit: StorageUnit): StorageUnitRow => ({
  id: unit.id,
  parentId: unit.parentId,
  name: unit.name,
  kind: unit.kind,
  description: unit.description,
  photoId: unit.photoId,
  publicId: unit.publicId,
  createdAt: unit.createdAt,
  updatedAt: unit.updatedAt,
});
