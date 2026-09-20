import type { Item, Photo, PhotoId, PhotoRepository } from "@ariadna/domain";

import { itemView, type ItemView } from "./views.js";

/**
 * # Turning items into views, without one query per photo
 *
 * `ItemView.photos` carries whole photos rather than ids, which means every
 * answer that contains items also has to load their photo rows. Done naively
 * that is a query per item, or per photo — on a screen that lists forty items
 * it is the same N+1 the item list route exists to remove.
 *
 * So the ids of a whole batch are gathered first and fetched in ONE call to
 * `findManyByIds`, and the projection reads from that. An item with no photos
 * costs nothing at all: there is no query when the batch turns out empty.
 *
 * This lives beside the views rather than inside them because `views.ts` is
 * pure projection — no ports, no `await` — and it is worth keeping it that
 * way: a view that could reach a repository is a view that can surprise a
 * caller with a round trip.
 */
export class ItemViews {
  constructor(private readonly photos: PhotoRepository) {}

  async of(item: Item): Promise<ItemView> {
    const [view] = await this.ofMany([item]);

    // `ofMany` answers one view per item it was given, in order.
    return view as ItemView;
  }

  async ofMany(items: readonly Item[]): Promise<ItemView[]> {
    const held = await this.#photosOf(items);

    return items.map((item) => itemView(item, held));
  }

  async #photosOf(
    items: readonly Item[],
  ): Promise<ReadonlyMap<PhotoId, Photo>> {
    const ids = [...new Set(items.flatMap((item) => [...item.photos]))];
    if (ids.length === 0) {
      return new Map();
    }

    const photos = await this.photos.findManyByIds(ids);

    return new Map(photos.map((photo) => [photo.id, photo]));
  }
}
