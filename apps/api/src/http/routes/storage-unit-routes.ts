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
} from "@ariadna/domain";
import type { FastifyPluginAsync } from "fastify";

import { buildStorageUnitForest } from "../storage-unit-tree.js";
import {
  createStorageUnitBodySchema,
  emptyStorageUnitBodySchema,
  idParamsSchema,
  moveStorageUnitBodySchema,
} from "../validation.js";
import { itemView, storageUnitTreeView, storageUnitView } from "../views.js";

export interface StorageUnitRouteOptions {
  readonly storageUnits: StorageUnitRepository;
  readonly items: ItemRepository;
  readonly createStorageUnit: CreateStorageUnit;
  readonly moveStorageUnit: MoveStorageUnit;
  readonly deleteStorageUnit: DeleteStorageUnit;
  readonly emptyStorageUnit: EmptyStorageUnit;
  readonly getStorageUnitPath: GetStorageUnitPath;
}

/** A total order, so two reads of an unchanged unit list the same way. */
const byName = <T extends { readonly name: string; readonly id: string }>(
  left: T,
  right: T,
): number => left.name.localeCompare(right.name, "en") || left.id.localeCompare(right.id);

/**
 * # Resource shapes
 *
 * `POST /storage-units/:id/move` and `POST /storage-units/:id/empty` are named
 * operations rather than a `PATCH` of the resource, for one reason: a storage
 * unit has no general update. The domain exposes create, move, empty and
 * delete, and nothing else. A `PATCH /storage-units/:id` accepting `parentId`
 * would advertise that the other fields are patchable too, and would hide the
 * fact that changing a parent is guarded by a subtree invariant (ADR 2) while
 * changing a name would not be.
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
      .send({ unit: storageUnitView(unit) });
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
      unit: storageUnitView(unit),
      path: path.map(storageUnitView),
      children: [...children].sort(byName).map(storageUnitView),
      items: [...items].sort(byName).map(itemView),
    });
  });

  app.post("/storage-units/:id/move", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const body = moveStorageUnitBodySchema.parse(request.body);

    const unit = await options.moveStorageUnit.execute({
      id: unitId(id),
      targetParentId: body.parentId === null ? null : unitId(body.parentId),
    });

    return reply.code(200).send({ unit: storageUnitView(unit) });
  });

  app.post("/storage-units/:id/empty", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const body = emptyStorageUnitBodySchema.parse(request.body);

    const result = await options.emptyStorageUnit.execute(
      unitId(id),
      body.targetUnitId === undefined ? undefined : unitId(body.targetUnitId),
    );

    return reply.code(200).send({
      movedItems: result.movedItems.map(itemView),
      movedChildUnits: result.movedChildUnits.map(storageUnitView),
    });
  });

  app.delete("/storage-units/:id", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);

    await options.deleteStorageUnit.execute(unitId(id));

    return reply.code(204).send();
  });
};
