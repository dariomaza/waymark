import type {
  DetachedItemPhotoResponse,
  DetachedStorageUnitPhotoResponse,
  ItemPhotoResponse,
  ItemResponse,
  StorageUnitPhotoResponse,
} from "@ariadna/api-client";
import type { ItemId, PhotoId, UnitId } from "@ariadna/domain";
import { useMutation, type UseMutationResult } from "@tanstack/react-query";

import { useApi } from "../api/api-context.js";
import type { PhotoUpload } from "../api/mobile-client.js";
import { useInvalidateInventory } from "../api/use-invalidate-inventory.js";

export const useUploadItemPhoto = (
  id: ItemId,
): UseMutationResult<ItemPhotoResponse, Error, PhotoUpload> => {
  const api = useApi();
  const invalidate = useInvalidateInventory();

  return useMutation({
    mutationFn: async (photo: PhotoUpload) => await api.uploadItemPhoto(id, photo),
    onSuccess: invalidate,
  });
};

/**
 * The complete list, in the wanted order; the first one is the cover.
 *
 * There is no `coverPhotoId` to set, in the API or here, and that is the
 * point of ADR 9: the cover is `photos[0]` and a second way to say the same
 * thing is how the two come to disagree. Choosing a cover is spelled as what
 * it is — a reorder.
 */
export const useReorderItemPhotos = (
  id: ItemId,
): UseMutationResult<ItemResponse, Error, readonly PhotoId[]> => {
  const api = useApi();
  const invalidate = useInvalidateInventory();

  return useMutation({
    mutationFn: async (photoIds: readonly PhotoId[]) =>
      await api.reorderItemPhotos(id, photoIds),
    onSuccess: invalidate,
  });
};

export const useDeleteItemPhoto = (
  id: ItemId,
): UseMutationResult<DetachedItemPhotoResponse, Error, PhotoId> => {
  const api = useApi();
  const invalidate = useInvalidateInventory();

  return useMutation({
    mutationFn: async (photoId: PhotoId) => await api.deleteItemPhoto(id, photoId),
    onSuccess: invalidate,
  });
};

/** A unit holds exactly one photo, so uploading is always a replacement. */
export const useUploadUnitPhoto = (
  id: UnitId,
): UseMutationResult<StorageUnitPhotoResponse, Error, PhotoUpload> => {
  const api = useApi();
  const invalidate = useInvalidateInventory();

  return useMutation({
    mutationFn: async (photo: PhotoUpload) => await api.uploadUnitPhoto(id, photo),
    onSuccess: invalidate,
  });
};

export const useDeleteUnitPhoto = (
  id: UnitId,
): UseMutationResult<DetachedStorageUnitPhotoResponse, Error, void> => {
  const api = useApi();
  const invalidate = useInvalidateInventory();

  return useMutation({
    mutationFn: async () => await api.deleteUnitPhoto(id),
    onSuccess: invalidate,
  });
};
