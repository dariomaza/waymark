import type { Clock } from "@ariadna/domain";
import type { PrismaClient } from "@prisma/client";

import { Base32PublicIdGenerator } from "./adapters/public-id-generator.js";
import { SystemClock } from "./adapters/system-clock.js";
import { UuidIdGenerator } from "./adapters/uuid-id-generator.js";
import { FixedWindowRateLimiter } from "./auth/login-rate-limiter.js";
import { ScryptPasswordHasher } from "./auth/password-hasher.js";
import type { ApiConfig } from "./config.js";
import type { AppDependencies } from "./http/build-app.js";
import { PrismaItemRepository } from "./persistence/prisma-item-repository.js";
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
export const createAppDependencies = (
  prisma: PrismaClient,
  config: ApiConfig,
  clock: Clock = new SystemClock(),
): AppDependencies => ({
  storageUnits: new PrismaStorageUnitRepository(prisma),
  items: new PrismaItemRepository(prisma),
  users: new PrismaUserRepository(prisma),
  sessions: new PrismaSessionRepository(prisma),
  hasher: new ScryptPasswordHasher(),
  ids: new UuidIdGenerator(),
  publicIds: new Base32PublicIdGenerator(),
  clock,
  rateLimiter: new FixedWindowRateLimiter({
    clock,
    limit: config.login.limit,
    windowMs: config.login.windowMs,
  }),
  security: config.security,
});
