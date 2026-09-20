/**
 * `@ariadna/api` — the adapters that implement the `@ariadna/domain` ports,
 * and the HTTP layer that exposes the use cases.
 *
 * QR code generation, photo upload and photo file storage are separate work
 * units and deliberately absent.
 */

// Ports implemented with the platform
export { SystemClock } from "./adapters/system-clock.js";
export { UuidIdGenerator } from "./adapters/uuid-id-generator.js";
export {
  Base32PublicIdGenerator,
  PUBLIC_ID_ALPHABET,
  PUBLIC_ID_LENGTH,
} from "./adapters/public-id-generator.js";

// Ports implemented with Prisma + SQLite
export { createPrismaClient } from "./persistence/prisma-client.js";
export {
  MAX_STORAGE_UNIT_ANCESTOR_DEPTH,
  PrismaStorageUnitRepository,
} from "./persistence/prisma-storage-unit-repository.js";
export { PrismaItemRepository } from "./persistence/prisma-item-repository.js";
export { PrismaUserRepository } from "./persistence/prisma-user-repository.js";
export { PrismaSessionRepository } from "./persistence/prisma-session-repository.js";
export {
  CorruptStorageUnitHierarchy,
  UnknownStorageUnitKind,
} from "./persistence/persistence-errors.js";

// Authentication
export {
  AuthError,
  InvalidCredentials,
  InvalidSession,
  TooManyLoginAttempts,
  UsernameAlreadyTaken,
} from "./auth/auth-errors.js";
export {
  DEFAULT_SCRYPT_PARAMETERS,
  MalformedPasswordHash,
  ScryptPasswordHasher,
  type PasswordHasher,
  type ScryptParameters,
} from "./auth/password-hasher.js";
export {
  SESSION_TOKEN_BYTES,
  hashSessionToken,
  issueSessionToken,
} from "./auth/session-token.js";
export {
  SESSION_RENEW_AFTER_MS,
  SESSION_TTL_MS,
  type Session,
} from "./auth/session.js";
export { normalizeUsername, type User } from "./auth/user.js";
export type { UserRepository } from "./auth/user-repository.js";
export type { SessionRepository } from "./auth/session-repository.js";
export {
  FixedWindowRateLimiter,
  type RateLimitDecision,
  type RateLimiter,
} from "./auth/login-rate-limiter.js";
export { CreateUser } from "./auth/create-user.js";
export { Login } from "./auth/login.js";
export { Logout } from "./auth/logout.js";
export {
  AuthenticateSession,
  type AuthenticatedCaller,
} from "./auth/authenticate-session.js";

// HTTP
export {
  buildApp,
  type AppDependencies,
  type SecurityConfig,
} from "./http/build-app.js";
export {
  CLOUDFLARE_CLIENT_IP_HEADER,
  LOOPBACK_PROXIES,
  UNKNOWN_CLIENT_IP,
  resolveClientIp,
} from "./http/client-ip.js";
export { mapDomainError, type MappedDomainError } from "./http/error-mapping.js";
export { HttpError } from "./http/http-error.js";
export {
  buildStorageUnitForest,
  type StorageUnitTreeNode,
} from "./http/storage-unit-tree.js";
export {
  itemView,
  storageUnitTreeView,
  storageUnitView,
  type ItemView,
  type StorageUnitTreeView,
  type StorageUnitView,
  type UserView,
} from "./http/views.js";

// Composition
export {
  InvalidConfiguration,
  loadConfig,
  type ApiConfig,
} from "./config.js";
export { createAppDependencies } from "./composition-root.js";
