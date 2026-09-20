import {
  createPhoto,
  displayPathOf,
  ItemNotFound,
  StorageUnitNotFound,
  itemId as toItemId,
  photoId as toPhotoId,
  unitId,
  type AttachItemPhoto,
  type DetachItemPhoto,
  type IdGenerator,
  type ItemRepository,
  type Photo,
  type PhotoId,
  type PhotoRepository,
  type ReorderItemPhotos,
  type SetStorageUnitPhoto,
  type StorageUnitRepository,
} from "@ariadna/domain";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";

import { contentTypeOf, formatOfExtension } from "../../photos/image-format.js";
import {
  MissingPhotoUpload,
  PhotoNotFound,
  PhotoTooLarge,
} from "../../photos/photo-errors.js";
import { PhotoFileStore, PhotoRootEscape } from "../../photos/photo-file-store.js";
import { ingestPhoto } from "../../photos/photo-ingestion.js";
import type { PhotoRelease } from "../../photos/photo-release.js";
import { IMMUTABLE_CACHE_CONTROL, etagOf, sendUnchangedOrPrepare } from "../caching.js";
import {
  idParamsSchema,
  itemPhotoParamsSchema,
  reorderItemPhotosBodySchema,
} from "../validation.js";
import { itemView, photoView, storageUnitView } from "../views.js";

export interface PhotoRouteOptions {
  readonly items: ItemRepository;
  readonly storageUnits: StorageUnitRepository;
  readonly photos: PhotoRepository;
  readonly files: PhotoFileStore;
  readonly release: PhotoRelease;
  readonly ids: IdGenerator;
  readonly maxUploadBytes: number;
  readonly attachItemPhoto: AttachItemPhoto;
  readonly detachItemPhoto: DetachItemPhoto;
  readonly reorderItemPhotos: ReorderItemPhotos;
  readonly setStorageUnitPhoto: SetStorageUnitPhoto;
}

/**
 * # Photo routes
 *
 * ## Upload is addressed to the thing that will hold it
 *
 * `POST /items/:id/photos`, not `POST /photos` followed by an attach. Two
 * reasons, both about failure. The cap on how many photos an item may hold is a
 * rule about the ITEM (`MAX_ITEM_PHOTOS`), so it can only be checked where the
 * item is known: a bare `POST /photos` would accept the bytes, write two files,
 * and only discover the refusal on the second call, leaving an orphan behind
 * every time. And a photo attached to nothing is unreachable — nothing points
 * at it, so no delete path will ever release it.
 *
 * A storage unit gets `POST /storage-units/:id/photo`, singular, because it
 * holds exactly one (`photoId`, not a list). Uploading a second REPLACES the
 * first and releases it, which is the only behaviour that does not leak.
 *
 * ## The order of operations on the way in
 *
 * 1. Confirm the item or unit exists, before a byte is read.
 * 2. Read the part, refusing anything over the size limit.
 * 3. Decode, re-orient, strip metadata, resize, produce a thumbnail.
 * 4. Write both files.
 * 5. Ask the domain to attach — which may still refuse, on the cap. Only then
 *    is the photo ROW saved, which `AttachItemPhoto` does in that order.
 *
 * A refusal before step 4 leaves nothing at all. A refusal at step 5 leaves two
 * files, which are removed immediately; if even that fails it is logged, never
 * thrown, for the same reason as `PhotoRelease`.
 *
 * ## Serving
 *
 * Behind the authenticated scope like everything else. These are photographs of
 * the inside of somebody's house on a public hostname; "the id is hard to
 * guess" is not an access control.
 *
 * The bytes are STREAMED. A stored photo is a couple of megabytes and a list
 * view opens twenty at once; buffering would make the process hold all of them
 * at the same time for no benefit.
 */
export const photoRoutes: FastifyPluginAsync<PhotoRouteOptions> = async (
  app,
  options,
) => {
  /**
   * Reads the one file part of a multipart request into memory.
   *
   * Buffered on purpose, unlike serving. The image is decoded and re-encoded
   * before a single byte reaches the disk, and that needs the whole file;
   * streaming it to a temporary file first would move the same bytes through
   * the filesystem twice and leave a temp file to clean up on every refusal.
   * The size cap is what makes holding it safe.
   */
  const readUpload = async (request: FastifyRequest): Promise<Buffer> => {
    if (!request.isMultipart()) {
      throw new MissingPhotoUpload();
    }

    let part;
    try {
      part = await request.file({ limits: { fileSize: options.maxUploadBytes } });
    } catch (error) {
      throw isFileTooLarge(error) ? new PhotoTooLarge(options.maxUploadBytes) : error;
    }

    if (part === undefined || part.fieldname !== "file") {
      throw new MissingPhotoUpload();
    }

    try {
      return await part.toBuffer();
    } catch (error) {
      throw isFileTooLarge(error) ? new PhotoTooLarge(options.maxUploadBytes) : error;
    }
  };

  /**
   * Everything between "bytes arrived" and "a `Photo` exists on disk".
   *
   * The row is NOT saved here: whichever use case is about to accept the photo
   * saves it, so a domain refusal cannot leave a row behind.
   */
  const storeUpload = async (request: FastifyRequest): Promise<Photo> => {
    const ingested = await ingestPhoto(await readUpload(request));

    const id = toPhotoId(options.ids.next());
    const paths = await options.files.write({
      id,
      format: ingested.format,
      original: ingested.original,
      thumbnail: ingested.thumbnail,
    });

    return createPhoto({ id, ...paths });
  };

  /** Files written for a photo the domain then refused are not left behind. */
  const discard = async (photo: Photo): Promise<void> => {
    const { failed } = await options.files.remove([
      photo.originalPath,
      photo.thumbnailPath,
    ]);
    if (failed.length > 0) {
      app.log.error(
        { photoId: photo.id, failed },
        "could not discard the files of a refused upload",
      );
    }
  };

  const releaseAndLog = async (
    ids: readonly PhotoId[],
  ): Promise<readonly PhotoId[]> => {
    const outcome = await options.release.release(ids);
    if (outcome.orphanedPaths.length > 0) {
      // The database already won; this is the price, logged with the exact
      // paths so a sweep is `rm` rather than an investigation.
      app.log.error(
        { orphanedPaths: outcome.orphanedPaths },
        "photo rows were deleted but their files could not be removed",
      );
    }

    return outcome.releasedPhotoIds;
  };

  const findPhoto = async (id: string): Promise<Photo> => {
    const photo = await options.photos.findById(toPhotoId(id));
    if (photo === null) {
      throw new PhotoNotFound(id);
    }

    return photo;
  };

  const serve = async (
    request: FastifyRequest,
    reply: FastifyReply,
    photo: Photo,
    relativePath: string,
    variant: string,
  ): Promise<unknown> => {
    let opened;
    try {
      opened = await options.files.open(relativePath);
    } catch (error) {
      if (error instanceof PhotoRootEscape) {
        // A stored path that escapes the root is a broken row, not a request to
        // satisfy. A 404 to the caller, a log line to the operator.
        request.log.error(
          { photoId: photo.id, relativePath },
          "stored photo path escapes the photo root",
        );
        throw new PhotoNotFound(photo.id);
      }

      throw error;
    }

    if (opened === null) {
      // The orphan this design tolerates is a file with no row. A row with no
      // file means something removed it underneath us, and that is worth saying.
      request.log.warn(
        { photoId: photo.id, relativePath },
        "a photo row points at a file that is not there",
      );
      throw new PhotoNotFound(photo.id);
    }

    const sent = sendUnchangedOrPrepare(request, reply, {
      // The path and the size are part of the tag, so a file that somehow
      // changed can never be served from a cache under the old one.
      etag: etagOf("photo", variant, photo.id, relativePath, String(opened.byteSize)),
      cacheControl: IMMUTABLE_CACHE_CONTROL,
      contentType: contentTypeOfPath(relativePath),
      contentLength: opened.byteSize,
    });

    if (sent) {
      // A 304 carries no body, so the handle opened above must not leak.
      (opened.stream as { destroy?: () => void }).destroy?.();
      return reply;
    }

    return reply.code(200).send(opened.stream);
  };

  app.post("/items/:id/photos", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);

    // Checked first, so an upload to a ghost item does not cost a decode and
    // two file writes before anybody notices.
    const item = await options.items.findById(toItemId(id));
    if (item === null) {
      throw new ItemNotFound(toItemId(id));
    }

    const photo = await storeUpload(request);

    let result;
    try {
      result = await options.attachItemPhoto.execute({ itemId: item.id, photo });
    } catch (error) {
      await discard(photo);
      throw error;
    }

    return reply
      .code(201)
      .header("location", `/photos/${photo.id}`)
      .send({ photo: photoView(result.photo), item: itemView(result.item) });
  });

  app.post("/items/:id/photos/order", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const body = reorderItemPhotosBodySchema.parse(request.body);

    const item = await options.reorderItemPhotos.execute({
      itemId: toItemId(id),
      photoIds: body.photoIds.map(toPhotoId),
    });

    return reply.code(200).send({ item: itemView(item) });
  });

  app.delete("/items/:id/photos/:photoId", async (request, reply) => {
    const params = itemPhotoParamsSchema.parse(request.params);

    const result = await options.detachItemPhoto.execute({
      itemId: toItemId(params.id),
      photoId: toPhotoId(params.photoId),
    });

    const released = await releaseAndLog(result.releasedPhotoIds);

    return reply
      .code(200)
      .send({ item: itemView(result.item), releasedPhotoIds: [...released] });
  });

  app.post("/storage-units/:id/photo", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);

    const unit = await options.storageUnits.findById(unitId(id));
    if (unit === null) {
      throw new StorageUnitNotFound(unitId(id));
    }

    const photo = await storeUpload(request);

    let result;
    try {
      result = await options.setStorageUnitPhoto.execute({ unitId: unit.id, photo });
    } catch (error) {
      await discard(photo);
      throw error;
    }

    const released = await releaseAndLog(result.releasedPhotoIds);

    return reply
      .code(201)
      .header("location", `/photos/${photo.id}`)
      .send({
        photo: photoView(photo),
        unit: storageUnitView(result.unit),
        releasedPhotoIds: [...released],
      });
  });

  app.delete("/storage-units/:id/photo", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);

    const result = await options.setStorageUnitPhoto.execute({
      unitId: unitId(id),
      photo: null,
    });

    const released = await releaseAndLog(result.releasedPhotoIds);

    return reply
      .code(200)
      .send({ unit: storageUnitView(result.unit), releasedPhotoIds: [...released] });
  });

  app.get("/photos/:id", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const photo = await findPhoto(id);

    // ADR 4: the processed variant when there is one, the original otherwise.
    return serve(request, reply, photo, displayPathOf(photo), "full");
  });

  app.get("/photos/:id/thumbnail", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const photo = await findPhoto(id);

    return serve(request, reply, photo, photo.thumbnailPath, "thumbnail");
  });
};

/**
 * The content type comes from the extension of the STORED path, which this
 * service wrote itself from a sniffed format — never from anything a client
 * said. The fallback is unreachable, and is the one type a browser will not
 * try to render if it ever is reached.
 */
const contentTypeOfPath = (relativePath: string): string => {
  const format = formatOfExtension(
    relativePath.slice(relativePath.lastIndexOf(".") + 1),
  );

  return format === null ? "application/octet-stream" : contentTypeOf(format);
};

const isFileTooLarge = (error: unknown): boolean =>
  (error as { code?: string } | null)?.code === "FST_REQ_FILE_TOO_LARGE";
