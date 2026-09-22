/**
 * `@waymark/api` — the adapters that implement the `@waymark/domain` ports,
 * and the HTTP layer that exposes the use cases.
 *
 * Background removal lives here too, behind the `ImageProcessor` port: the
 * adapter that talks to the rembg sidecar, the queue that remembers what has
 * been attempted, and the worker that drains it. All three are optional, and
 * the API is complete without any of them (ADR 4).
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
export { PrismaPhotoRepository } from "./persistence/prisma-photo-repository.js";
export { PrismaUserRepository } from "./persistence/prisma-user-repository.js";
export { PrismaSessionRepository } from "./persistence/prisma-session-repository.js";
export {
  CorruptStorageUnitHierarchy,
  UnknownPhotoProcessingStatus,
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
  type PhotoStorageConfig,
  type SecurityConfig,
} from "./http/build-app.js";
export {
  CLOUDFLARE_CLIENT_IP_HEADER,
  LOOPBACK_PROXIES,
  UNKNOWN_CLIENT_IP,
  resolveClientIp,
} from "./http/client-ip.js";
export { mapDomainError, type MappedDomainError } from "./http/error-mapping.js";
export {
  DERIVED_CACHE_CONTROL,
  IMMUTABLE_CACHE_CONTROL,
  PENDING_PHOTO_CACHE_CONTROL,
  etagOf,
  isFresh,
} from "./http/caching.js";
export { HttpError } from "./http/http-error.js";
export {
  buildStorageUnitForest,
  type StorageUnitTreeNode,
} from "./http/storage-unit-tree.js";
export {
  itemView,
  photoView,
  storageUnitTreeView,
  storageUnitView,
  type ItemView,
  type PhotoView,
  type StorageUnitTreeView,
  type StorageUnitView,
  type UserView,
} from "./http/views.js";

// Photos
export {
  SUPPORTED_IMAGE_FORMATS,
  contentTypeOf,
  extensionOf,
  formatOfExtension,
  sniffImageFormat,
  type SupportedImageFormat,
} from "./photos/image-format.js";
export {
  MAX_STORED_EDGE_PX,
  THUMBNAIL_EDGE_PX,
  ingestPhoto,
  type IngestedPhoto,
} from "./photos/photo-ingestion.js";
export {
  PHOTO_BUCKET_LENGTH,
  PhotoFileStore,
  PhotoRootEscape,
  type StoredPhotoPaths,
} from "./photos/photo-file-store.js";
export { PhotoRelease, type ReleaseOutcome } from "./photos/photo-release.js";
export {
  PermanentProcessingFailure,
  TransientProcessingFailure,
} from "./photos/photo-processing-failures.js";
export {
  RembgImageProcessor,
  type RembgImageProcessorDependencies,
} from "./photos/rembg-image-processor.js";
export {
  SWITCHED_OFF,
  createPhotoProcessing,
  type ImageProcessorStatus,
  type PhotoProcessingDependencies,
  type ReachableImageProcessor,
} from "./photos/photo-processing.js";
export {
  PhotoProcessingWorker,
  RETRY_BACKOFF_BASE_MS,
  RETRY_BACKOFF_CAP_MS,
  backoffFor,
  type PhotoProcessingWorkerDependencies,
  type RunSummary,
} from "./photos/photo-processing-worker.js";
export {
  PrismaPhotoProcessingQueue,
  type AbandonedPhoto,
  type ClaimedPhoto,
  type PhotoProcessingQueue,
  type ProcessingCounts,
} from "./photos/photo-processing-queue.js";
export {
  MissingPhotoUpload,
  PhotoNotFound,
  PhotoTooLarge,
  UnsupportedImageFormat,
} from "./photos/photo-errors.js";

// QR codes
export {
  QR_ERROR_CORRECTION_LEVEL,
  STORAGE_UNIT_PATH_PREFIX,
  renderStorageUnitQrPng,
  renderStorageUnitQrSvg,
  storageUnitUrl,
} from "./qr/storage-unit-qr.js";

// Composition
export {
  InvalidConfiguration,
  loadConfig,
  type ApiConfig,
  type ImageProcessingConfig,
  type PhotoConfig,
} from "./config.js";
export {
  composeApp,
  createAppDependencies,
  type ComposedApp,
} from "./composition-root.js";
