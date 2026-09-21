import {
  StorageUnitNotFound,
  photoId as toPhotoId,
  unitId,
  type CreateStorageUnit,
  type DeleteStorageUnit,
  type EmptyStorageUnit,
  type GetStorageUnitPath,
  type ItemRepository,
  type MoveStorageUnit,
  type StorageUnitRepository,
  type UpdateStorageUnit,
} from "@ariadna/domain";
import type { FastifyPluginAsync } from "fastify";

import type { ItemViews } from "../item-views.js";
import { buildStorageUnitForest } from "../storage-unit-tree.js";
import type { StorageUnitViews } from "../storage-unit-views.js";
import {
  createStorageUnitBodySchema,
  emptyStorageUnitBodySchema,
  idParamsSchema,
  moveStorageUnitBodySchema,
  updateStorageUnitBodySchema,
} from "../validation.js";
import { storageUnitTreeView, storageUnitView } from "../views.js";

export interface StorageUnitRouteOptions {
  readonly storageUnits: StorageUnitRepository;
  readonly items: ItemRepository;
  readonly createStorageUnit: CreateStorageUnit;
  readonly moveStorageUnit: MoveStorageUnit;
  readonly updateStorageUnit: UpdateStorageUnit;
  readonly deleteStorageUnit: DeleteStorageUnit;
  readonly emptyStorageUnit: EmptyStorageUnit;
  readonly getStorageUnitPath: GetStorageUnitPath;
  readonly itemViews: ItemViews;
  /** Only the unit an answer is ABOUT carries its photo; rows never do. */
  readonly storageUnitViews: StorageUnitViews;
}

/** A total order, so two reads of an unchanged unit list the same way. */
const byName = <T extends { readonly name: string; readonly id: string }>(
  left: T,
  right: T,
): number => left.name.localeCompare(right.name, "en") || left.id.localeCompare(right.id);

/**
 * # Resource shapes
 *
 * ## `PATCH` for what a unit says, named operations for what it IS
 *
 * There are now two kinds of change and they are spelled differently on
 * purpose.
 *
 * `PATCH /storage-units/:id` changes what the unit says about itself — its
 * name, its kind, its description. Those are plain attributes with no rule
 * beyond the field itself, they are edited together in one form, and naming
 * an operation for each would mean `/rename`, `/redescribe` and `/rekind`:
 * three routes for one screen, and a form that changed two of them at once
 * would be two round trips that can half-fail.
 *
 * `POST /storage-units/:id/move` and `POST /storage-units/:id/empty` stay
 * named operations, because they are not attribute changes. Moving is guarded
 * by the subtree invariant (ADR 2) and emptying relocates everything inside.
 * A route called `move` says that; a field called `parentId` on a patch does
 * not, and the whole risk of a general update is that the one dangerous
 * change ends up looking exactly like a rename.
 *
 * The line is held by the schema rather than by discipline:
 * `updateStorageUnitBodySchema` is strict and has no `parentId`, so a request
 * carrying one is refused with a 400 that names the key. Ignoring it would be
 * worse than refusing it — a client would believe it had moved a box.
 *
 * ## One screen, one response
 *
 * `GET /storage-units/:id` answers with the unit, its path, its children and
 * its items in one response, because that is one screen. Making a client do
 * four round trips to draw a breadcrumb and a list would be an API designed
 * around the tables rather than around the product.
 */
export const storageUnitRoutes: FastifyPluginAsync<StorageUnitRouteOptions> = async (
  app,
  options,
) => {
  app.get("/storage-units", async (_request, reply) => {
    const units = await options.storageUnits.findAll();

    return reply.code(200).send({
      tree: buildStorageUnitForest(units).map(storageUnitTreeView),
    });
  });

  app.post("/storage-units", async (request, reply) => {
    const body = createStorageUnitBodySchema.parse(request.body);

    const unit = await options.createStorageUnit.execute({
      parentId: body.parentId == null ? null : unitId(body.parentId),
      name: body.name,
      kind: body.kind,
      description: body.description ?? null,
      photoId: body.photoId == null ? null : toPhotoId(body.photoId),
    });

    return reply
      .code(201)
      .header("location", `/storage-units/${unit.id}`)
      .send({ unit: await options.storageUnitViews.of(unit) });
  });

  app.get("/storage-units/:id", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);

    // Throws `StorageUnitNotFound` when the unit is not there, which the error
    // mapping turns into a 404 because the id came from the path.
    const path = await options.getStorageUnitPath.execute(unitId(id));
    const unit = path.at(-1);
    if (unit === undefined) {
      throw new StorageUnitNotFound(unitId(id));
    }

    const [children, items] = await Promise.all([
      options.storageUnits.findChildren(unitId(id)),
      options.items.findByStorageUnit(unitId(id)),
    ]);

    return reply.code(200).send({
      unit: await options.storageUnitViews.of(unit),
      path: path.map(storageUnitView),
      children: [...children].sort(byName).map(storageUnitView),
      items: await options.itemViews.ofMany([...items].sort(byName)),
    });
  });

  app.post("/storage-units/:id/move", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const body = moveStorageUnitBodySchema.parse(request.body);

    const unit = await options.moveStorageUnit.execute({
      id: unitId(id),
      targetParentId: body.parentId === null ? null : unitId(body.parentId),
    });

    return reply.code(200).send({ unit: await options.storageUnitViews.of(unit) });
  });

  app.patch("/storage-units/:id", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const body = updateStorageUnitBodySchema.parse(request.body);

    const unit = await options.updateStorageUnit.execute({
      id: unitId(id),
      // Spread field by field, so an absent field stays absent rather than
      // becoming an explicit `undefined` the use case would have to unpick.
      ...(body.name === undefined ? {} : { name: body.name }),
      ...(body.kind === undefined ? {} : { kind: body.kind }),
      ...(body.description === undefined ? {} : { description: body.description }),
    });

    return reply.code(200).send({ unit: await options.storageUnitViews.of(unit) });
  });

  app.post("/storage-units/:id/empty", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const body = emptyStorageUnitBodySchema.parse(request.body);

    const result = await options.emptyStorageUnit.execute(
      unitId(id),
      body.targetUnitId === undefined ? undefined : unitId(body.targetUnitId),
    );

    return reply.code(200).send({
      movedItems: await options.itemViews.ofMany(result.movedItems),
      movedChildUnits: result.movedChildUnits.map(storageUnitView),
    });
  });

  app.delete("/storage-units/:id", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);

    await options.deleteStorageUnit.execute(unitId(id));

    return reply.code(204).send();
  });
};
