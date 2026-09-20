import type { PhotoId } from "@ariadna/domain";

/**
 * # The one URL this app still has to build
 *
 * The API spells out `url` and `thumbnailUrl` on every `PhotoView` so no
 * client ever has to construct one, and `ItemView.photos` now carries those
 * views rather than ids. An item's gallery therefore builds nothing.
 *
 * A storage unit still points at a bare `photoId`, and it holds exactly one
 * photo with no order and no state worth showing, so one route is written
 * down here instead of inline in the component that needs it. The day
 * `StorageUnitView` carries a photo view too, this file goes.
 */
export const photoUrl = (id: PhotoId): string => `/photos/${encodeURIComponent(id)}`;
