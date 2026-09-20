import type { Item, ItemId, ItemRepository, UnitId } from "@ariadna/domain";
import type { Prisma, PrismaClient } from "@prisma/client";

import {
  ITEM_RELATIONS,
  toDomainItem,
  toItemPhotoRows,
  toItemRow,
  toItemTagRows,
} from "./item-mapper.js";

/** Anything that can run item writes: the client itself, or a transaction. */
type ItemWriter = Pick<PrismaClient, "item" | "itemTag" | "itemPhoto">;

export class PrismaItemRepository implements ItemRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: ItemId): Promise<Item | null> {
    const row = await this.prisma.item.findUnique({
      where: { id },
      include: ITEM_RELATIONS,
    });

    return row === null ? null : toDomainItem(row);
  }

  /**
   * The port promises the caller's own order back, and `MoveItems` compares
   * what it asked for against what it got. A relational `IN (...)` returns rows
   * in whatever order the planner likes, so the result is re-sequenced here;
   * ids that match nothing are simply absent, exactly as the port says.
   */
  async findManyByIds(ids: readonly ItemId[]): Promise<Item[]> {
    if (ids.length === 0) {
      return [];
    }

    const rows = await this.prisma.item.findMany({
      where: { id: { in: [...new Set<string>(ids)] } },
      include: ITEM_RELATIONS,
    });
    const byId = new Map(rows.map((row) => [row.id, row]));

    return ids.flatMap((id) => {
      const row = byId.get(id);
      return row === undefined ? [] : [toDomainItem(row)];
    });
  }

  /**
   * One query and its two joins, rather than one query per unit. The ordering
   * that matters — tags and photos inside an item — is the mapper's; the rows
   * themselves come back in whatever order the planner likes, exactly as the
   * port promises.
   */
  async findAll(): Promise<Item[]> {
    const rows = await this.prisma.item.findMany({ include: ITEM_RELATIONS });

    return rows.map(toDomainItem);
  }

  async findByStorageUnit(id: UnitId): Promise<Item[]> {
    const rows = await this.prisma.item.findMany({
      where: { storageUnitId: id },
      include: ITEM_RELATIONS,
    });

    return rows.map(toDomainItem);
  }

  async countByStorageUnit(id: UnitId): Promise<number> {
    return this.prisma.item.count({ where: { storageUnitId: id } });
  }

  async save(item: Item): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await writeItem(transaction, item);
    });
  }

  async saveAll(items: readonly Item[]): Promise<void> {
    if (items.length === 0) {
      return;
    }

    // All or nothing, so a bulk move (ADR 3) cannot strand half a batch.
    await this.prisma.$transaction(async (transaction) => {
      for (const item of items) {
        await writeItem(transaction, item);
      }
    });
  }

  async delete(id: ItemId): Promise<void> {
    // `deleteMany` so an unknown id is a no-op; tags and photo links go with it
    // through the schema's cascade. Deleting an item never deletes a `Photo`:
    // ADR 3 says its files are RELEASED, and `DeleteItem` hands the caller the
    // ids to release.
    await this.prisma.item.deleteMany({ where: { id } });
  }
}

/**
 * A save is a statement about the WHOLE item, never a patch, so the ordered
 * child rows are replaced rather than merged. Anything else would let a
 * removed tag or a reordered photo survive a save and make the adapter
 * disagree with the in-memory repository.
 */
const writeItem = async (
  writer: ItemWriter,
  item: Item,
): Promise<void> => {
  const row = toItemRow(item);

  await writer.item.upsert({
    where: { id: item.id },
    create: row,
    update: row,
  });

  await writer.itemTag.deleteMany({ where: { itemId: item.id } });
  await writer.itemPhoto.deleteMany({ where: { itemId: item.id } });

  const tags = toItemTagRows(item);
  if (tags.length > 0) {
    await writer.itemTag.createMany({ data: tags });
  }

  const photos = toItemPhotoRows(item);
  if (photos.length > 0) {
    await writer.itemPhoto.createMany({ data: photos });
  }
};

/** Kept so the transaction client stays assignable to `ItemWriter`. */
export type ItemTransactionClient = Prisma.TransactionClient;
