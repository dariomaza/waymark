import type { Clock } from "@ariadna/domain";
import type { PrismaClient } from "@prisma/client";

import { Base32PublicIdGenerator } from "./adapters/public-id-generator.js";
import { SystemClock } from "./adapters/system-clock.js";
import { UuidIdGenerator } from "./adapters/uuid-id-generator.js";
import { FixedWindowRateLimiter } from "./auth/login-rate-limiter.js";
import { ScryptPasswordHasher } from "./auth/password-hasher.js";
import type { ApiConfig } from "./config.js";
import type { AppDependencies } from "./http/build-app.js";
import { PhotoFileStore } from "./photos/photo-file-store.js";
import { createPhotoProcessing } from "./photos/photo-processing.js";
import { PrismaPhotoProcessingQueue } from "./photos/photo-processing-queue.js";
import {
  PhotoProcessingWorker,
  type WorkerLogger,
} from "./photos/photo-processing-worker.js";
import { RembgImageProcessor } from "./photos/rembg-image-processor.js";
import { PrismaItemRepository } from "./persistence/prisma-item-repository.js";
import { PrismaPhotoRepository } from "./persistence/prisma-photo-repository.js";
import { PrismaSearchRepository } from "./persistence/prisma-search-repository.js";
import { PrismaSessionRepository } from "./persistence/prisma-session-repository.js";
import { PrismaStorageUnitRepository } from "./persistence/prisma-storage-unit-repository.js";
import { PrismaUserRepository } from "./persistence/prisma-user-repository.js";

/**
 * The one place that knows which adapter implements which port.
 *
 * Everything else in the API receives its collaborators through a constructor,
 * which is what keeps a use case testable against the in-memory repositories
 * and the real ones without knowing the difference.
 */

export interface ComposedApp {
  readonly dependencies: AppDependencies;
  /**
   * `null` when no sidecar is configured, which is a complete installation and
   * not a degraded one (ADR 4). The process starts it; nothing else touches it.
   */
  readonly worker: PhotoProcessingWorker | null;
}

/**
 * The lease has to outlive an attempt, or a photo still at the sidecar would be
 * handed to somebody else while the first attempt is still running. Twice the
 * request timeout leaves room for the read, the compositing and the write.
 */
const LEASE_FACTOR = 2;

export const composeApp = (
  prisma: PrismaClient,
  config: ApiConfig,
  clock: Clock = new SystemClock(),
  logger?: WorkerLogger,
): ComposedApp => {
  const photos = new PrismaPhotoRepository(prisma);
  const files = new PhotoFileStore(config.photos.root);
  const queue = new PrismaPhotoProcessingQueue(prisma);

  // No address means the feature is off, and off means nothing is constructed:
  // no processor, no worker, no timer. The routes still answer, and they say so.
  const processor =
    config.imageProcessing.url === null
      ? null
      : new RembgImageProcessor({
          baseUrl: config.imageProcessing.url,
          files,
          timeoutMs: config.imageProcessing.timeoutMs,
        });

  const worker =
    processor === null
      ? null
      : new PhotoProcessingWorker({
          photos,
          queue,
          processor,
          clock,
          concurrency: config.imageProcessing.concurrency,
          maxAttempts: config.imageProcessing.maxAttempts,
          pollIntervalMs: config.imageProcessing.pollIntervalMs,
          leaseMs: config.imageProcessing.timeoutMs * LEASE_FACTOR,
          ...(logger === undefined ? {} : { logger }),
        });

  return {
    worker,
    dependencies: {
      storageUnits: new PrismaStorageUnitRepository(prisma),
      items: new PrismaItemRepository(prisma),
      photos,
      search: new PrismaSearchRepository(prisma),
      users: new PrismaUserRepository(prisma),
      sessions: new PrismaSessionRepository(prisma),
      hasher: new ScryptPasswordHasher(),
      ids: new UuidIdGenerator(),
      publicIds: new Base32PublicIdGenerator(),
      clock,
      publicBaseUrl: config.publicBaseUrl,
      photoStorage: {
        root: config.photos.root,
        maxUploadBytes: config.photos.maxBytes,
      },
      photoProcessing: createPhotoProcessing({
        queue,
        processor: () => processor,
        worker: () => worker,
      }),
      rateLimiter: new FixedWindowRateLimiter({
        clock,
        limit: config.login.limit,
        windowMs: config.login.windowMs,
      }),
      security: config.security,
      // Absent, not null: an API with no web client behind it registers no
      // fallback at all, which is exactly what it did before one existed.
      ...(config.webRoot === null ? {} : { webClient: { root: config.webRoot } }),
    },
  };
};

/** The dependencies alone, for callers that do not run the worker. */
export const createAppDependencies = (
  prisma: PrismaClient,
  config: ApiConfig,
  clock: Clock = new SystemClock(),
): AppDependencies => composeApp(prisma, config, clock).dependencies;
