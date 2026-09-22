import {
  itemId,
  photoId,
  publicId,
  PhotoProcessingStatus,
  SearchMatchField,
  StorageUnitKind,
  unitId,
} from "@waymark/domain";

import type {
  ItemSearchResultView,
  ItemView,
  PhotoView,
  SessionView,
  StorageUnitSearchResultView,
  StorageUnitTreeView,
  StorageUnitView,
  StorageUnitWithPhotoView,
} from "../contract.js";

/**
 * Builders for the JSON the API sends.
 *
 * Ids are taken as plain strings and branded here, because a test reads better
 * as `aStorageUnit({ id: "garage" })` than as a line of ceremony, and because
 * the wire hands out strings anyway.
 */

const AT = "2026-09-20T10:00:00.000Z";

export interface StorageUnitOverrides {
  readonly id?: string;
  readonly parentId?: string | null;
  readonly name?: string;
  readonly kind?: StorageUnitKind;
  readonly description?: string | null;
  readonly publicId?: string;
}

export const aStorageUnit = (overrides: StorageUnitOverrides = {}): StorageUnitView => {
  const id = overrides.id ?? "unit-1";

  return {
    id: unitId(id),
    parentId: overrides.parentId == null ? null : unitId(overrides.parentId),
    name: overrides.name ?? "Box 3",
    kind: overrides.kind ?? StorageUnitKind.BOX,
    description: overrides.description ?? null,
    publicId: publicId(overrides.publicId ?? `PUB${id.toUpperCase()}`),
    createdAt: AT,
    updatedAt: AT,
  };
};

/**
 * The same unit as the SUBJECT of an answer rather than as a row.
 *
 * Only those answers carry a photo, so this is spelled separately: a fixture
 * that put `photo` on every tree node and every breadcrumb step would let a
 * screen read one from a row the real API does not carry it on.
 */
export const withPhoto = (
  unit: StorageUnitView,
  photo: PhotoView | string | null = null,
): StorageUnitWithPhotoView => ({
  ...unit,
  photo: typeof photo === "string" ? aPhoto({ id: photo }) : photo,
});

export const aTree = (
  unit: StorageUnitView,
  children: readonly StorageUnitTreeView[] = [],
): StorageUnitTreeView => ({ ...unit, children });

export interface ItemOverrides {
  readonly id?: string;
  readonly storageUnitId?: string;
  readonly name?: string;
  readonly description?: string | null;
  readonly quantity?: number;
  readonly tags?: readonly string[];
  /** An id is shorthand for a photo nobody has processed yet. */
  readonly photos?: readonly (string | PhotoView)[];
}

export const anItem = (overrides: ItemOverrides = {}): ItemView => {
  const photos = (overrides.photos ?? []).map((photo) =>
    typeof photo === "string" ? aPhoto({ id: photo }) : photo,
  );

  return {
    id: itemId(overrides.id ?? "item-1"),
    storageUnitId: unitId(overrides.storageUnitId ?? "unit-1"),
    name: overrides.name ?? "Cordless drill",
    description: overrides.description ?? null,
    quantity: overrides.quantity ?? 1,
    tags: overrides.tags ?? [],
    photos,
    coverPhotoId: photos[0]?.id ?? null,
    createdAt: AT,
    updatedAt: AT,
  };
};

export interface PhotoOverrides {
  readonly id?: string;
  readonly processingStatus?: PhotoProcessingStatus;
}

export const aPhoto = (overrides: PhotoOverrides = {}): PhotoView => {
  const id = overrides.id ?? "photo-1";

  return {
    id: photoId(id),
    // `PENDING` by default on purpose: that is what a photo is the moment it
    // is uploaded, and it may stay that way for ever (ADR 4).
    processingStatus: overrides.processingStatus ?? PhotoProcessingStatus.PENDING,
    url: `/photos/${id}`,
    thumbnailUrl: `/photos/${id}/thumbnail`,
  };
};

export const anItemHit = (
  item: ItemView,
  path: readonly StorageUnitView[],
  matchedFields: readonly SearchMatchField[] = [SearchMatchField.NAME],
): ItemSearchResultView => ({
  item,
  path,
  location: path.map((unit) => unit.name).join(" > "),
  matchedFields,
});

export const aUnitHit = (
  unit: StorageUnitView,
  path: readonly StorageUnitView[],
  matchedFields: readonly SearchMatchField[] = [SearchMatchField.NAME],
): StorageUnitSearchResultView => ({
  unit,
  path,
  location: path.map((step) => step.name).join(" > "),
  matchedFields,
});

export interface SessionOverrides {
  readonly token?: string;
  readonly expiresAt?: string;
  readonly username?: string;
}

/** A session that is live for years, unless a test says otherwise. */
export const aSession = (overrides: SessionOverrides = {}): SessionView => ({
  token: overrides.token ?? "a-live-token",
  expiresAt: overrides.expiresAt ?? "2099-01-01T00:00:00.000Z",
  user: { id: "u1", username: overrides.username ?? "dario" },
});
