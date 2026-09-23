import type {
  DetachedItemPhotoResponse,
  DetachedStorageUnitPhotoResponse,
  ItemPhotoResponse,
  ItemResponse,
  RequeuedPhotoResponse,
  RequeuedPhotosResponse,
  StorageUnitPhotoResponse,
} from "@waymark/api-client";
import type { ItemId, PhotoId, UnitId } from "@waymark/domain";
import { useMutation, type UseMutationResult } from "@tanstack/react-query";

import { queryKeys } from "@waymark/api-client";
import { useQueryClient } from "@tanstack/react-query";

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

/**
 * "Try that background removal again."
 *
 * ADR 4 left it as an open consequence and ADR 10 built the route: a `FAILED`
 * photo stays unprocessed for ever unless something asks. The answer is a
 * `202` — the photo is queued, and nothing here waits for `DONE`, which is
 * the whole of ADR 4 expressed as a mutation.
 */
export const useReprocessPhoto = (): UseMutationResult<
  RequeuedPhotoResponse,
  Error,
  PhotoId
> => {
  const api = useApi();
  const queries = useQueryClient();
  const invalidate = useInvalidateInventory();

  return useMutation({
    mutationFn: async (photoId: PhotoId) => await api.reprocessPhoto(photoId),
    onSuccess: () => {
      invalidate();
      /*
       * And the queue, which is a separate graph (`INVENTORY_ROOTS` does not
       * reach it). A photo put back changes what the processing screen says
       * about how many are stuck, and that screen is where this button is
       * most often pressed.
       */
      void queries.invalidateQueries({ queryKey: queryKeys.photoProcessing() });
    },
  });
};

/**
 * "Try all of them again."
 *
 * The bulk half of the same idea, and the reason the queue screen exists: a
 * sidecar that was down for an hour leaves a pile of `FAILED` photos, and
 * tapping each one in turn is the chore ADR 10 built the route to avoid.
 *
 * The answer is a `202` and a COUNT — how many went back — and nothing here
 * waits for any of them to finish. It invalidates the queue rather than the
 * inventory: the counts on that screen are what just changed, and the boxes
 * are not.
 */
export const useRetryFailedPhotos = (): UseMutationResult<
  RequeuedPhotosResponse,
  Error,
  void
> => {
  const api = useApi();
  const queries = useQueryClient();

  return useMutation({
    mutationFn: async () => await api.retryFailedPhotos(),
    onSuccess: () => {
      void queries.invalidateQueries({ queryKey: queryKeys.photoProcessing() });
    },
  });
};
