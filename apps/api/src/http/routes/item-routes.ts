import {
  ItemNotFound,
  itemId as toItemId,
  photoId as toPhotoId,
  unitId,
  type CreateItem,
  type DeleteItem,
  type GetStorageUnitPath,
  type ItemRepository,
  type MoveItems,
} from "@ariadna/domain";
import type { FastifyPluginAsync } from "fastify";

import type { PhotoRelease } from "../../photos/photo-release.js";

import { createItemBodySchema, idParamsSchema, moveItemsBodySchema } from "../validation.js";
import { itemView, storageUnitView } from "../views.js";

export interface ItemRouteOptions {
  readonly items: ItemRepository;
  readonly createItem: CreateItem;
  readonly moveItems: MoveItems;
  readonly deleteItem: DeleteItem;
  readonly getStorageUnitPath: GetStorageUnitPath;
  readonly photoRelease: PhotoRelease;
}

/**
 * # Resource shapes
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
      .send({ item: itemView(item) });
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
      item: itemView(item),
      storageUnit: storageUnit === undefined ? null : storageUnitView(storageUnit),
      path: path.map(storageUnitView),
    });
  });

  app.post("/items/move", async (request, reply) => {
    const body = moveItemsBodySchema.parse(request.body);

    const items = await options.moveItems.execute({
      itemIds: body.itemIds.map(toItemId),
      targetUnitId: unitId(body.targetUnitId),
    });

    return reply.code(200).send({ items: items.map(itemView) });
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
