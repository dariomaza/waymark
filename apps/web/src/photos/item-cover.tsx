import type { ItemView } from "@waymark/api-client";
import type { JSX } from "react";

import { LazyPhoto } from "./lazy-photo.js";

export interface ItemCoverProps {
  readonly item: ItemView;
}

/**
 * The picture a thing is recognised by, in a grid.
 *
 * Answers `null` when there is no photo yet, which is what lets the card fall
 * back to the thing's initials. That is not an error state: an inventory gets
 * built by registering forty things in an afternoon and photographing them
 * another day, so most of a new grid looks like this.
 *
 * The alt text is empty on purpose. The name is right underneath in the same
 * link, so describing the picture as well would announce the same thing
 * twice — and "photo of Cordless drill" tells somebody who cannot see it
 * nothing they did not already have.
 */
export const ItemCover = ({ item }: ItemCoverProps): JSX.Element | null => {
  const cover = item.photos[0];

  return cover === undefined ? null : <LazyPhoto src={cover.thumbnailUrl} alt="" />;
};
