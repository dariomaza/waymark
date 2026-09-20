import {
  createPhoto,
  markPhotoFailed,
  markPhotoProcessed,
  markPhotoSkipped,
  photoId,
  PhotoProcessingStatus,
  type Photo,
  type PhotoId,
  type PhotoRepository,
} from "@ariadna/domain";
import type { Photo as PhotoRow, PrismaClient } from "@prisma/client";

import { UnknownPhotoProcessingStatus } from "./persistence-errors.js";

/**
 * Photos are stored as rows pointing at files, never as blobs.
 *
 * A blob column would put every photo inside the SQLite file that is also the
 * inventory, so the one artefact that should stay small enough to copy anywhere
 * would become tens of gigabytes, and every backup and `VACUUM` would pay for
 * it. The bytes live on a plain directory (`PhotoFileStore`); this table is the
 * index that makes them findable.
 *
 * There is deliberately no foreign key to `Item` or `StorageUnit`: a photo is
 * its own aggregate with its own lifecycle (ADR 4), referenced by id.
 */
export class PrismaPhotoRepository implements PhotoRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: PhotoId): Promise<Photo | null> {
    const row = await this.prisma.photo.findUnique({ where: { id } });

    return row === null ? null : toDomainPhoto(row);
  }

  /** The port promises the caller's own order back; `IN (...)` promises none. */
  async findManyByIds(ids: readonly PhotoId[]): Promise<Photo[]> {
    if (ids.length === 0) {
      return [];
    }

    const rows = await this.prisma.photo.findMany({
      where: { id: { in: [...new Set<string>(ids)] } },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));

    return ids.flatMap((id) => {
      const row = byId.get(id);
      return row === undefined ? [] : [toDomainPhoto(row)];
    });
  }

  async save(photo: Photo): Promise<void> {
    const row = toPhotoRow(photo);

    await this.prisma.photo.upsert({
      where: { id: photo.id },
      create: row,
      update: row,
    });
  }

  /**
   * `deleteMany` so ids that are already gone are a no-op rather than an error.
   * Releasing files is retried, and a retry must not start failing once it has
   * succeeded.
   */
  async deleteMany(ids: readonly PhotoId[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    await this.prisma.photo.deleteMany({ where: { id: { in: [...ids] } } });
  }
}

/**
 * The status column is a string, for the same reason `StorageUnit.kind` is:
 * SQLite has no enum type. So the mapper is the boundary that refuses a value
 * the domain says cannot exist, rather than letting it through as a `Photo`
 * nobody can reason about.
 */
const toDomainPhoto = (row: PhotoRow): Photo => {
  const photo = createPhoto({
    id: photoId(row.id),
    originalPath: row.originalPath,
    thumbnailPath: row.thumbnailPath,
  });

  switch (row.processingStatus) {
    case PhotoProcessingStatus.PENDING:
      return photo;
    case PhotoProcessingStatus.DONE:
      // A DONE row with no processed path is the database disagreeing with
      // itself; `displayPathOf` would silently fall back and hide it.
      if (row.processedPath === null) {
        throw new UnknownPhotoProcessingStatus(row.id, "DONE without a processed path");
      }
      return markPhotoProcessed(photo, row.processedPath);
    case PhotoProcessingStatus.FAILED:
      return markPhotoFailed(photo);
    case PhotoProcessingStatus.SKIPPED:
      return markPhotoSkipped(photo);
    default:
      throw new UnknownPhotoProcessingStatus(row.id, row.processingStatus);
  }
};

const toPhotoRow = (photo: Photo): PhotoRow => ({
  id: photo.id,
  originalPath: photo.originalPath,
  thumbnailPath: photo.thumbnailPath,
  processedPath: photo.processedPath,
  processingStatus: photo.processingStatus,
});
