import { queryKeys } from "@ariadna/api-client";
import type {
  DetachedItemPhotoResponse,
  DetachedStorageUnitPhotoResponse,
  ItemPhotoResponse,
  ItemResponse,
  RequeuedPhotoResponse,
  RequeuedPhotosResponse,
  StorageUnitPhotoResponse,
} from "@ariadna/api-client";
import type { ItemId, PhotoId, UnitId } from "@ariadna/domain";
import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";

import { useApi } from "../api/api-context.js";
import { useInvalidateInventory } from "../api/use-invalidate-inventory.js";

export const useUploadItemPhoto = (
  id: ItemId,
): UseMutationResult<ItemPhotoResponse, Error, File> => {
  const api = useApi();
  const invalidate = useInvalidateInventory();

  return useMutation({
    mutationFn: async (file: File) => await api.uploadItemPhoto(id, file),
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
): UseMutationResult<StorageUnitPhotoResponse, Error, File> => {
  const api = useApi();
  const invalidate = useInvalidateInventory();

  return useMutation({
    mutationFn: async (file: File) => await api.uploadUnitPhoto(id, file),
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

/**
 * # "Try that background removal again"
 *
 * ADR 4 left this as an open consequence and ADR 10 built the routes for it:
 * a `FAILED` photo stays unprocessed for ever unless something asks again.
 *
 * The answer is a `202` — the photo is queued, and nothing here waits for
 * `DONE`, which is the whole of ADR 4 expressed as a mutation. What changes
 * on the screen is the photo's state going back to pending, so the inventory
 * is re-read like it is after any other write, and so is the processing
 * summary if a screen happens to be showing it.
 */
export const useReprocessPhoto = (): UseMutationResult<
  RequeuedPhotoResponse,
  Error,
  PhotoId
> => {
  const api = useApi();
  const invalidate = useInvalidateInventory();
  const queries = useQueryClient();

  return useMutation({
    mutationFn: async (photoId: PhotoId) => await api.reprocessPhoto(photoId),
    onSuccess: () => {
      invalidate();
      void queries.invalidateQueries({ queryKey: queryKeys.photoProcessing() });
    },
  });
};

/** Every `FAILED` photo at once, which is the real ask after a dead sidecar. */
export const useRetryFailedPhotos = (): UseMutationResult<
  RequeuedPhotosResponse,
  Error,
  void
> => {
  const api = useApi();
  const invalidate = useInvalidateInventory();
  const queries = useQueryClient();

  return useMutation({
    mutationFn: async () => await api.retryFailedPhotos(),
    onSuccess: () => {
      invalidate();
      void queries.invalidateQueries({ queryKey: queryKeys.photoProcessing() });
    },
  });
};
