import {
  ItemNotFound,
  itemId as toItemId,
  photoId as toPhotoId,
  unitId,
  type CreateItem,
  type DeleteItem,
  type GetStorageUnitPath,
  type ItemRepository,
  type ListItems,
  type MoveItems,
  type UpdateItem,
} from "@waymark/domain";
import type { FastifyPluginAsync } from "fastify";

import type { PhotoRelease } from "../../photos/photo-release.js";

import type { ItemViews } from "../item-views.js";

import {
  createItemBodySchema,
  idParamsSchema,
  listItemsQuerySchema,
  moveItemsBodySchema,
  updateItemBodySchema,
} from "../validation.js";
import { itemAtLocationView, storageUnitView } from "../views.js";

export interface ItemRouteOptions {
  readonly items: ItemRepository;
  readonly createItem: CreateItem;
  readonly listItems: ListItems;
  readonly moveItems: MoveItems;
  readonly updateItem: UpdateItem;
  readonly deleteItem: DeleteItem;
  readonly getStorageUnitPath: GetStorageUnitPath;
  readonly itemViews: ItemViews;
  readonly photoRelease: PhotoRelease;
}

/**
 * # Resource shapes
 *
 * `PATCH /items/:id` changes what an item says about itself: its name, its
 * description, how many there are, its tags. Retagging is the one worth
 * naming — a tag is the entire reason searching `cables` finds an item called
 * `HDMI 2.1` (ADR 11), and before this route the only way to fix a typo in
 * one was to delete the item, which also deletes its photos.
 *
 * It cannot move the item. `updateItemBodySchema` is strict and has no
 * `storageUnitId`, so a request carrying one is refused with a 400 naming the
 * key rather than silently ignored. Where a thing is, is the one fact this
 * product exists to be right about, and it changes through a route that says
 * `move`.
 *
 * ## `GET /items` answers the whole inventory, and carries the location
 *
 * The web client used to build "everything you own" from one
 * `GET /storage-units/:id` per unit — N+1 over HTTP, from a phone, on a home
 * connection. This is the route that removes it, and every row carries the
 * same breadcrumb a search hit does: a flat list of names in a product about
 * knowing WHERE something is answers nothing.
 *
 * ### There is no pagination, deliberately
 *
 * Four hundred boxes is a few thousand items, and a few thousand of these
 * rows is a fraction of a megabyte — less than the client was already
 * transferring as tens of separate unit responses, and one connection instead
 * of tens. That is the same reading of the size of a homelab inventory that
 * ADR 1 made for the tree, ADR 11 for search scoping and ADR 12 for resolving
 * a scanned label, and this is the fourth place it holds.
 *
 * A page would also have to be wrong about something. The order is
 * alphabetical, so a cursor is a name that is not unique and can change under
 * an edit; an offset shifts the moment somebody in the house adds an item.
 * And the screen is "everything you own", which people scan and use the
 * browser's own find on — infinite scroll takes that away. The honest answer
 * to an inventory too large to list is search, which this product already
 * has, is named after, and which takes a limit for exactly that reason.
 *
 * So the route takes no parameters at all, and REFUSES the ones it does not
 * take rather than ignoring them: a `?limit=20` quietly dropped would tell a
 * client it had been handed the first twenty of something.
 *
 * `POST /items/move` is a collection level operation, not N calls to N items.
 * `MoveItems` is all or nothing by design (ADR 3): one unknown id rejects the
 * whole batch. Spelling that as `PATCH /items/:id` repeated in a loop would
 * hand the client a half-moved inventory the first time one id is stale.
 *
 * `DELETE /items/:id` answers 200 with `releasedPhotoIds` rather than 204. The
 * domain hands back the photos no item references any more (ADR 3), and the
 * caller is the one that owns the files. Throwing that away to return an empty
 * 204 would leak a file per deleted item, forever.
 *
 * This route is that caller: it releases them, deleting the rows and then the
 * files. The order — and what happens when the filesystem refuses — is decided
 * in `PhotoRelease`, and it is decided in favour of the database.
 */
export const itemRoutes: FastifyPluginAsync<ItemRouteOptions> = async (
  app,
  options,
) => {
  app.post("/items", async (request, reply) => {
    const body = createItemBodySchema.parse(request.body);

    const item = await options.createItem.execute({
      storageUnitId: unitId(body.storageUnitId),
      name: body.name,
      description: body.description ?? null,
      ...(body.quantity === undefined ? {} : { quantity: body.quantity }),
      tags: body.tags ?? [],
      photos: (body.photos ?? []).map(toPhotoId),
    });

    return reply
      .code(201)
      .header("location", `/items/${item.id}`)
      .send({ item: await options.itemViews.of(item) });
  });

  app.get("/items", async (request, reply) => {
    listItemsQuerySchema.parse(request.query);

    const rows = await options.itemViews.withViews(await options.listItems.execute());

    return reply.code(200).send({
      items: rows.map(({ row, view }) => itemAtLocationView(view, row.path)),
    });
  });

  app.get("/items/:id", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);

    const item = await options.items.findById(toItemId(id));
    if (item === null) {
      throw new ItemNotFound(toItemId(id));
    }

    // "Where is it" is the question the product exists to answer, so the path
    // ships with the item instead of costing a second round trip.
    const path = await options.getStorageUnitPath.execute(item.storageUnitId);
    const storageUnit = path.at(-1);

    return reply.code(200).send({
      item: await options.itemViews.of(item),
      storageUnit: storageUnit === undefined ? null : storageUnitView(storageUnit),
      path: path.map(storageUnitView),
    });
  });

  app.patch("/items/:id", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const body = updateItemBodySchema.parse(request.body);

    const item = await options.updateItem.execute({
      id: toItemId(id),
      ...(body.name === undefined ? {} : { name: body.name }),
      ...(body.description === undefined ? {} : { description: body.description }),
      ...(body.quantity === undefined ? {} : { quantity: body.quantity }),
      ...(body.tags === undefined ? {} : { tags: body.tags }),
    });

    return reply.code(200).send({ item: await options.itemViews.of(item) });
  });

  app.post("/items/move", async (request, reply) => {
    const body = moveItemsBodySchema.parse(request.body);

    const items = await options.moveItems.execute({
      itemIds: body.itemIds.map(toItemId),
      targetUnitId: unitId(body.targetUnitId),
    });

    return reply.code(200).send({ items: await options.itemViews.ofMany(items) });
  });

  app.delete("/items/:id", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);

    const result = await options.deleteItem.execute(toItemId(id));

    // The item is gone from the database before a single file is touched. A
    // disk that refuses to give up a file cannot un-delete the item.
    const outcome = await options.photoRelease.release(result.releasedPhotoIds);
    if (outcome.orphanedPaths.length > 0) {
      request.log.error(
        { orphanedPaths: outcome.orphanedPaths },
        "photo rows were deleted but their files could not be removed",
      );
    }

    return reply.code(200).send({ releasedPhotoIds: [...outcome.releasedPhotoIds] });
  });
};
