import type { PhotoId } from "@ariadna/domain";

/**
 * # Why this file exists, reluctantly
 *
 * The API spells out `url` and `thumbnailUrl` on every `PhotoView` precisely
 * so no client has to build one — and then `ItemView.photos` is a list of
 * ids, and a storage unit carries a bare `photoId`. A screen that draws an
 * item's photos therefore has no `PhotoView` to read a URL from.
 *
 * So the two routes are written down here, in one place, rather than inline
 * in three components. Anything that DOES hold a `PhotoView` uses the URL the
 * API sent; this is only for the ids.
 */
export const photoUrl = (id: PhotoId): string => `/photos/${encodeURIComponent(id)}`;

/** The small one. A grid of these is the first screen anybody opens. */
export const photoThumbnailUrl = (id: PhotoId): string =>
  `/photos/${encodeURIComponent(id)}/thumbnail`;
