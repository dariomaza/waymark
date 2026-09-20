import { FakeClock } from "@ariadna/domain/testing";
import type { FastifyInstance } from "fastify";

import { UuidIdGenerator } from "../../adapters/uuid-id-generator.js";
import { Base32PublicIdGenerator } from "../../adapters/public-id-generator.js";
import { CreateUser } from "../../auth/create-user.js";
import { FixedWindowRateLimiter } from "../../auth/login-rate-limiter.js";
import { ScryptPasswordHasher } from "../../auth/password-hasher.js";
import { PrismaItemRepository } from "../../persistence/prisma-item-repository.js";
import { PrismaSessionRepository } from "../../persistence/prisma-session-repository.js";
import { PrismaStorageUnitRepository } from "../../persistence/prisma-storage-unit-repository.js";
import { PrismaUserRepository } from "../../persistence/prisma-user-repository.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../persistence/testing/test-database.js";
import { buildApp } from "../build-app.js";
import { LOOPBACK_PROXIES } from "../client-ip.js";

/**
 * A real Fastify instance in front of real Prisma repositories on a real
 * SQLite file. Nothing between the HTTP boundary and the database is a double:
 * a route test that mocks the repositories proves the handler calls something,
 * which is the one thing that was never in doubt.
 */
export const TEST_START = new Date("2026-04-01T10:00:00.000Z");

export const TEST_ORIGIN = "https://ariadna.example";

export const TEST_USERNAME = "dario";
export const TEST_PASSWORD = "a-real-password";

export const LOGIN_ATTEMPT_LIMIT = 5;
export const LOGIN_WINDOW_MS = 15 * 60_000;

/** Cheap KDF parameters: these tests are about routing, not about cost. */
const CHEAP_KDF = {
  cost: 1024,
  blockSize: 8,
  parallelism: 1,
  keyLength: 32,
  saltLength: 16,
} as const;

export interface TestApi {
  readonly database: TestDatabase;
  app: FastifyInstance;
  clock: FakeClock;
  /** Empties the database and rebuilds the app, clock and rate limiter. */
  reset(): Promise<void>;
  destroy(): Promise<void>;
  createUser(username: string, password: string): Promise<void>;
  /** Logs in and returns the bearer token. */
  login(username?: string, password?: string): Promise<string>;
  authHeaders(token: string): Record<string, string>;
}

export const createTestApi = async (): Promise<TestApi> => {
  const database = await createTestDatabase();
  const hasher = new ScryptPasswordHasher(CHEAP_KDF);
  const ids = new UuidIdGenerator();
  const publicIds = new Base32PublicIdGenerator();

  const users = new PrismaUserRepository(database.client);
  const sessions = new PrismaSessionRepository(database.client);
  const storageUnits = new PrismaStorageUnitRepository(database.client);
  const items = new PrismaItemRepository(database.client);

  const api: TestApi = {
    database,
    app: undefined as unknown as FastifyInstance,
    clock: new FakeClock(TEST_START),

    async reset(): Promise<void> {
      await database.reset();
      if (api.app !== undefined) {
        await api.app.close();
      }

      api.clock = new FakeClock(TEST_START);
      api.app = buildApp({
        storageUnits,
        items,
        users,
        sessions,
        hasher,
        ids,
        publicIds,
        clock: api.clock,
        rateLimiter: new FixedWindowRateLimiter({
          clock: api.clock,
          limit: LOGIN_ATTEMPT_LIMIT,
          windowMs: LOGIN_WINDOW_MS,
        }),
        security: {
          trustedProxies: LOOPBACK_PROXIES,
          allowedOrigins: [TEST_ORIGIN],
        },
        logger: false,
      });
      await api.app.ready();
    },

    async destroy(): Promise<void> {
      await api.app?.close();
      await database.destroy();
    },

    async createUser(username: string, password: string): Promise<void> {
      await new CreateUser({ users, hasher, ids, clock: api.clock }).execute({
        username,
        password,
      });
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
