import {
  StorageUnitNotFound,
  unitId,
  type StorageUnitRepository,
} from "@ariadna/domain";
import type { FastifyPluginAsync } from "fastify";

import {
  QR_ERROR_CORRECTION_LEVEL,
  renderStorageUnitQrPng,
  renderStorageUnitQrSvg,
  storageUnitUrl,
} from "../../qr/storage-unit-qr.js";
import { DERIVED_CACHE_CONTROL, etagOf, sendUnchangedOrPrepare } from "../caching.js";
import { idParamsSchema } from "../validation.js";

export interface QrRouteOptions {
  readonly storageUnits: StorageUnitRepository;
  readonly publicBaseUrl: string;
}

/**
 * # `GET /storage-units/:id/qr.png` and `.svg`
 *
 * The extension is in the path rather than in an `Accept` header on purpose.
 * The single most common way these are consumed is `<img src>` in the PWA and a
 * right-click "save image as" by whoever is printing a sheet of labels, and
 * neither of those negotiates content. A URL that names its format is one a
 * person can paste.
 *
 * Both are behind the authenticated scope, like everything else. A QR route
 * open to the world would let anybody enumerate storage units by id and, more
 * to the point, would be a second, quieter way to ask "does this box exist".
 * The label on the box is public because it is in your garage; the endpoint
 * that draws it is on the internet.
 *
 * SVG is the one to print. It is resolution independent, so the same bytes
 * produce a crisp symbol at any label size, and it is about a tenth of the PNG.
 * PNG exists because `<img>` in a hurry and because some label software still
 * refuses vectors.
 */
export const qrRoutes: FastifyPluginAsync<QrRouteOptions> = async (app, options) => {
  const urlFor = async (rawId: string): Promise<string> => {
    const id = unitId(rawId);
    const unit = await options.storageUnits.findById(id);
    if (unit === null) {
      // The id came from the path, so this is a 404 rather than a 422 (ADR 8).
      throw new StorageUnitNotFound(id);
    }

    return storageUnitUrl(options.publicBaseUrl, unit.publicId);
  };

  /**
   * The tag covers everything the bytes depend on: the URL and the correction
   * level. Change `ARIADNA_PUBLIC_BASE_URL` and every tag changes with it, so a
   * phone holding a cached picture of the old hostname revalidates into the new
   * one instead of keeping a dead label.
   */
  const tagFor = (url: string, format: string): string =>
    etagOf("storage-unit-qr", format, QR_ERROR_CORRECTION_LEVEL, url);

  app.get("/storage-units/:id/qr.png", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const url = await urlFor(id);
    const png = await renderStorageUnitQrPng(url);

    const sent = sendUnchangedOrPrepare(request, reply, {
      etag: tagFor(url, "png"),
      cacheControl: DERIVED_CACHE_CONTROL,
      contentType: "image/png",
      contentLength: png.byteLength,
    });

    return sent ? reply : reply.code(200).send(png);
  });

  app.get("/storage-units/:id/qr.svg", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const url = await urlFor(id);
    const svg = await renderStorageUnitQrSvg(url);

    const sent = sendUnchangedOrPrepare(request, reply, {
      etag: tagFor(url, "svg"),
      cacheControl: DERIVED_CACHE_CONTROL,
      contentType: "image/svg+xml; charset=utf-8",
    });

    return sent ? reply : reply.code(200).send(svg);
  });
};
