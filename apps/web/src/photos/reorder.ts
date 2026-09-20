import type { PhotoId } from "@ariadna/domain";

/**
 * The cover is `photos[0]` and nothing else (ADR 9), so choosing one is
 * spelled as moving it to the front. Pure, and therefore the one part of
 * reordering that can be reasoned about without a network.
 */
export const withCoverFirst = (
  photos: readonly PhotoId[],
  id: PhotoId,
): readonly PhotoId[] => [id, ...photos.filter((other) => other !== id)];

/** Swaps a photo with the one before it. The first one stays put. */
export const movedEarlier = (
  photos: readonly PhotoId[],
  id: PhotoId,
): readonly PhotoId[] => {
  const index = photos.indexOf(id);
  if (index <= 0) {
    return photos;
  }

  const reordered = [...photos];
  const previous = reordered[index - 1];
  const current = reordered[index];
  if (previous === undefined || current === undefined) {
    return photos;
  }

  reordered[index - 1] = current;
  reordered[index] = previous;

  return reordered;
};
