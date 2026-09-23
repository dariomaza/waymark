import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FakeClock } from "@waymark/domain/testing";
import type { FastifyInstance } from "fastify";

import type { PhotoId } from "@waymark/domain";

import { UuidIdGenerator } from "../../adapters/uuid-id-generator.js";
import { Base32PublicIdGenerator } from "../../adapters/public-id-generator.js";
import { CreateMachineToken } from "../../auth/create-machine-token.js";
import { CreateUser } from "../../auth/create-user.js";
import { FixedWindowRateLimiter } from "../../auth/login-rate-limiter.js";
import type { MachineTokenScope } from "../../auth/machine-token.js";
import { ScryptPasswordHasher } from "../../auth/password-hasher.js";
import { RevokeMachineToken } from "../../auth/revoke-machine-token.js";
import { PrismaItemRepository } from "../../persistence/prisma-item-repository.js";
import { PrismaMachineTokenRepository } from "../../persistence/prisma-machine-token-repository.js";
import { PrismaPhotoRepository } from "../../persistence/prisma-photo-repository.js";
import { PrismaSearchRepository } from "../../persistence/prisma-search-repository.js";
import { PrismaSessionRepository } from "../../persistence/prisma-session-repository.js";
import { PrismaStorageUnitRepository } from "../../persistence/prisma-storage-unit-repository.js";
import { PrismaUserRepository } from "../../persistence/prisma-user-repository.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../persistence/testing/test-database.js";
import { PhotoFileStore } from "../../photos/photo-file-store.js";
import { createPhotoProcessing } from "../../photos/photo-processing.js";
import { PrismaPhotoProcessingQueue } from "../../photos/photo-processing-queue.js";
import {
  PhotoProcessingWorker,
  type RunSummary,
} from "../../photos/photo-processing-worker.js";
import { RembgImageProcessor } from "../../photos/rembg-image-processor.js";
import { buildApp } from "../build-app.js";
import { LOOPBACK_PROXIES } from "../client-ip.js";

/**
 * A real Fastify instance in front of real Prisma repositories on a real
 * SQLite file. Nothing between the HTTP boundary and the database is a double:
 * a route test that mocks the repositories proves the handler calls something,
 * which is the one thing that was never in doubt.
 */
export const TEST_START = new Date("2026-04-01T10:00:00.000Z");

export const TEST_ORIGIN = "https://waymark.example";

/** What a scanned QR code in these tests is expected to resolve against. */
export const TEST_PUBLIC_BASE_URL = "https://waymark.example";

export const TEST_USERNAME = "dario";
export const TEST_PASSWORD = "a-real-password";

export const LOGIN_ATTEMPT_LIMIT = 5;
export const LOGIN_WINDOW_MS = 15 * 60_000;

/**
 * Small enough that an oversized upload is a fixture a test can build in
 * milliseconds, and large enough that every honest fixture fits under it.
 */
export const MAX_UPLOAD_BYTES_IN_TESTS = 256 * 1024;

/** Cheap KDF parameters: these tests are about routing, not about cost. */
const CHEAP_KDF = {
  cost: 1024,
  blockSize: 8,
  parallelism: 1,
  keyLength: 32,
  saltLength: 16,
} as const;

/**
 * Background removal in a test is opt-in, exactly as it is in production: an
 * API built without this has no processor, no worker and no timers, which is
 * also the configuration most of the suite runs under — so every photo test
 * that does not mention the sidecar is, incidentally, a test that the sidecar
 * is not required.
 */
export interface TestImageProcessorOptions {
  readonly baseUrl: string;
  readonly timeoutMs?: number;
  readonly maxAttempts?: number;
  readonly concurrency?: number;
}

export interface TestApiOptions {
  readonly imageProcessor?: TestImageProcessorOptions;
  /**
   * A directory shaped like `apps/web/dist`. Absent means the API serves no
   * web client at all, which is how every other file in this suite runs — so
   * every one of them is, incidentally, a test that the API is still a
   * complete JSON service on its own.
   */
  readonly webRoot?: string;
}

export interface TestApi {
  readonly database: TestDatabase;
  /** A real temporary directory; nothing about the filesystem is faked. */
  readonly photoRoot: string;
  app: FastifyInstance;
  clock: FakeClock;
  /** Empties the database and rebuilds the app, clock and rate limiter. */
  reset(): Promise<void>;
  destroy(): Promise<void>;
  /** Where the background-removed variant of a photo would be written. */
  processedPathOf(photoId: string): string;
  /**
   * Runs the worker once, in the foreground, so a test can say "and then the
   * background happened" without racing a timer. Answers a zero summary when
   * no sidecar is configured.
   */
  runProcessing(): Promise<RunSummary>;
  /** Re-points the processor, for the cases about a sidecar going away. */
  pointProcessorAt(baseUrl: string): void;
  createUser(username: string, password: string): Promise<void>;
  /** Issues one and returns the secret, exactly as the CLI prints it once. */
  createMachineToken(
    name: string,
    scope: MachineTokenScope,
    expiresInDays?: number,
  ): Promise<string>;
  revokeMachineToken(name: string): Promise<boolean>;
  /** Straight out of the database, so a test can assert it never leaves it. */
  machineTokenHashOf(name: string): Promise<string>;
  lastUsedAtOf(name: string): Promise<Date | null>;
  machineHeaders(token: string): Record<string, string>;
  /** Logs in and returns the bearer token. */
  login(username?: string, password?: string): Promise<string>;
  authHeaders(token: string): Record<string, string>;
}

export const createTestApi = async (
  options: TestApiOptions = {},
): Promise<TestApi> => {
  const database = await createTestDatabase();
  const photoRoot = await mkdtemp(join(tmpdir(), "waymark-photo-root-"));
  const hasher = new ScryptPasswordHasher(CHEAP_KDF);
  const ids = new UuidIdGenerator();
  const publicIds = new Base32PublicIdGenerator();

  const users = new PrismaUserRepository(database.client);
  const machineTokens = new PrismaMachineTokenRepository(database.client);
  const sessions = new PrismaSessionRepository(database.client);
  const storageUnits = new PrismaStorageUnitRepository(database.client);
  const items = new PrismaItemRepository(database.client);
  const photos = new PrismaPhotoRepository(database.client);
  const search = new PrismaSearchRepository(database.client);
  const files = new PhotoFileStore(photoRoot);
  const queue = new PrismaPhotoProcessingQueue(database.client);

  let processorBaseUrl = options.imageProcessor?.baseUrl ?? null;
  let processor: RembgImageProcessor | null = null;
  let worker: PhotoProcessingWorker | null = null;

  const rebuildProcessing = (): void => {
    if (processorBaseUrl === null) {
      processor = null;
      worker = null;
      return;
    }

    processor = new RembgImageProcessor({
      baseUrl: processorBaseUrl,
      files,
      timeoutMs: options.imageProcessor?.timeoutMs ?? 1_000,
    });
    worker = new PhotoProcessingWorker({
      photos,
      queue,
      processor,
      clock: api.clock,
      concurrency: options.imageProcessor?.concurrency ?? 1,
      maxAttempts: options.imageProcessor?.maxAttempts ?? 3,
      // The tests drive the worker by hand; the timer would only add a race.
      pollIntervalMs: 60_000,
      leaseMs: 60_000,
    });
  };

  const api: TestApi = {
    database,
    photoRoot,
    app: undefined as unknown as FastifyInstance,
    clock: new FakeClock(TEST_START),

    async reset(): Promise<void> {
      await database.reset();
      // The files go with the rows. A case that starts with the previous
      // case's photos on disk is a case that proves nothing.
      await rm(photoRoot, { recursive: true, force: true });
      if (api.app !== undefined) {
        await api.app.close();
      }

      api.clock = new FakeClock(TEST_START);
      rebuildProcessing();
      api.app = buildApp({
        storageUnits,
        items,
        photos,
        search,
        users,
        sessions,
        machineTokens,
        hasher,
        ids,
        publicIds,
        clock: api.clock,
        publicBaseUrl: TEST_PUBLIC_BASE_URL,
        photoStorage: {
          root: photoRoot,
          maxUploadBytes: MAX_UPLOAD_BYTES_IN_TESTS,
        },
        // `wake` is deliberately inert: a test that drives `runProcessing`
        // explicitly is a test that can assert what happened, rather than one
        // that waits and hopes.
        photoProcessing: createPhotoProcessing({
          queue,
          processor: () => processor,
          worker: () => null,
        }),
        rateLimiter: new FixedWindowRateLimiter({
          clock: api.clock,
          limit: LOGIN_ATTEMPT_LIMIT,
          windowMs: LOGIN_WINDOW_MS,
        }),
        security: {
          trustedProxies: LOOPBACK_PROXIES,
          allowedOrigins: [TEST_ORIGIN],
        },
        ...(options.webRoot === undefined
          ? {}
          : { webClient: { root: options.webRoot } }),
        logger: false,
      });
      await api.app.ready();
    },

    async destroy(): Promise<void> {
      await api.app?.close();
      await database.destroy();
      await rm(photoRoot, { recursive: true, force: true });
    },

    processedPathOf(photoId: string): string {
      return files.processedPathFor(photoId as PhotoId);
    },

    async runProcessing(): Promise<RunSummary> {
      return (
        worker?.runOnce() ?? {
          claimed: 0,
          processed: 0,
          skipped: 0,
          retried: 0,
          abandoned: 0,
        }
      );
    },

    pointProcessorAt(baseUrl: string): void {
      processorBaseUrl = baseUrl;
      rebuildProcessing();
    },

    async createUser(username: string, password: string): Promise<void> {
      await new CreateUser({ users, hasher, ids, clock: api.clock }).execute({
        username,
        password,
      });
    },

    async createMachineToken(
      name: string,
      scope: MachineTokenScope,
      expiresInDays?: number,
    ): Promise<string> {
      const { token } = await new CreateMachineToken({
        machineTokens,
        ids,
        clock: api.clock,
      }).execute({
        name,
        scope,
        ...(expiresInDays === undefined ? {} : { expiresInDays }),
      });

      return token;
    },

    async revokeMachineToken(name: string): Promise<boolean> {
      return new RevokeMachineToken({ machineTokens }).execute(name);
    },

    async machineTokenHashOf(name: string): Promise<string> {
      const stored = await machineTokens.findByName(name);
      if (stored === null) {
        throw new Error(`No machine token named "${name}"`);
      }

      return stored.tokenHash;
    },

    async lastUsedAtOf(name: string): Promise<Date | null> {
      return (await machineTokens.findByName(name))?.lastUsedAt ?? null;
    },

    machineHeaders(token: string): Record<string, string> {
      return { authorization: `Machine ${token}` };
    },

    async login(
      username: string = TEST_USERNAME,
      password: string = TEST_PASSWORD,
    ): Promise<string> {
      const response = await api.app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { username, password },
      });

      if (response.statusCode !== 200) {
        throw new Error(
          `login failed with ${response.statusCode}: ${response.body}`,
        );
      }

      return (response.json() as { token: string }).token;
    },

    authHeaders(token: string): Record<string, string> {
      return { authorization: `Bearer ${token}` };
    },
  };

  await api.reset();

  return api;
};
