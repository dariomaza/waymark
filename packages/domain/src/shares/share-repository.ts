import type { ShareOfSpace } from "../access/access.js";
import type { UnitId, UserId } from "../shared/identity.js";

/**
 * A space shared with one person, at one level, covering everything under it
 * (ADR 26). The same shape `resolveAccess` reads, so there is one definition.
 */
export type Share = ShareOfSpace;

/**
 * Where shares are kept. Deliberately small: resolving access reads all of
 * them (a household has a handful), and the administrator sets or removes one
 * at a time.
 */
export interface ShareRepository {
  /** Every share, in no guaranteed order. */
  findAll(): Promise<Share[]>;

  /**
   * Shares a space with a person at a level. There is one share per space and
   * person, so setting it again replaces the level rather than adding a row.
   */
  set(share: Share): Promise<void>;

  /** Stops sharing a space with a person. A no-op when it was not shared. */
  remove(storageUnitId: UnitId, userId: UserId): Promise<void>;
}
