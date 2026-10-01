import type { UnitId, UserId } from "../shared/identity.js";

/**
 * What a person is (ADR 26). An administrator sees and edits everything and is
 * the only one who shares; a user sees their own inventory plus what has been
 * shared with them. "View only" is not a role: it belongs to a share.
 */
export const Role = {
  ADMINISTRATOR: "administrator",
  USER: "user",
} as const;

export type Role = (typeof Role)[keyof typeof Role];

/** What a person may do with a space they can reach. */
export const ShareLevel = {
  VIEW: "view",
  EDIT: "edit",
} as const;

export type ShareLevel = (typeof ShareLevel)[keyof typeof ShareLevel];

/**
 * Everything a person may reach, resolved once per request (ADR 26).
 *
 * `scoped.spaces` is already expanded down the tree: every space below a space
 * the person owns or was shared is listed with its effective level. A space
 * that is absent is one the person may not see at all.
 *
 * `narrowed` is true for a machine token narrowed to chosen spaces: the top of
 * the tree is outside those spaces, so it may neither make a root nor move
 * anything to or from the top (ADR 26).
 */
export type Access =
  | { readonly kind: "everything" }
  | {
      readonly kind: "scoped";
      readonly spaces: ReadonlyMap<UnitId, ShareLevel>;
      readonly narrowed: boolean;
    };

/** The caller whose access is being resolved. */
export interface AccessCaller {
  readonly userId: UserId;
  readonly role: Role;
}

/**
 * The shape of a storage unit that visibility depends on. `ownerId` is set on
 * roots only; every space below a root belongs to that root's owner.
 */
export interface SpaceInTree {
  readonly id: UnitId;
  readonly parentId: UnitId | null;
  readonly ownerId: UserId | null;
}

/** A space shared with one person, at one level, covering everything under it. */
export interface ShareOfSpace {
  readonly storageUnitId: UnitId;
  readonly userId: UserId;
  readonly access: ShareLevel;
}

export interface ResolveAccessInput {
  readonly caller: AccessCaller;
  readonly storageUnits: readonly SpaceInTree[];
  readonly shares: readonly ShareOfSpace[];
}

const EVERYTHING: Access = { kind: "everything" };

const isAtLeast = (held: ShareLevel | undefined, wanted: ShareLevel): boolean =>
  held === ShareLevel.EDIT || held === wanted;

/**
 * The one place that walks the tree to decide visibility (ADR 26).
 *
 * A person reaches the spaces they own at `edit`, and each space shared with
 * them at the share's level; both cascade to everything below. Where grants
 * overlap, the most permissive level wins, so a view share on a garage and an
 * edit share on one shelf inside it make only that shelf (and what it holds)
 * editable.
 */
export const resolveAccess = ({
  caller,
  storageUnits,
  shares,
}: ResolveAccessInput): Access => {
  if (caller.role === Role.ADMINISTRATOR) {
    return EVERYTHING;
  }

  const known = new Set<UnitId>();
  const childrenOf = new Map<UnitId, UnitId[]>();
  for (const unit of storageUnits) {
    known.add(unit.id);
    if (unit.parentId !== null) {
      const siblings = childrenOf.get(unit.parentId) ?? [];
      siblings.push(unit.id);
      childrenOf.set(unit.parentId, siblings);
    }
  }

  const spaces = new Map<UnitId, ShareLevel>();

  // Whenever a space holds a level, its whole subtree holds at least that level
  // too. So a walk stops at any space that already holds the level it carries,
  // which also keeps it finite should the stored tree ever contain a loop.
  const grant = (top: UnitId, level: ShareLevel): void => {
    const pending: UnitId[] = [top];
    while (pending.length > 0) {
      const id = pending.pop() as UnitId;
      if (isAtLeast(spaces.get(id), level)) {
        continue;
      }
      spaces.set(id, level);
      pending.push(...(childrenOf.get(id) ?? []));
    }
  };

  for (const unit of storageUnits) {
    if (unit.ownerId === caller.userId) {
      grant(unit.id, ShareLevel.EDIT);
    }
  }
  for (const share of shares) {
    if (share.userId === caller.userId && known.has(share.storageUnitId)) {
      grant(share.storageUnitId, share.access);
    }
  }

  return { kind: "scoped", spaces, narrowed: false };
};

/**
 * The spaces a machine token was narrowed to, or the fact that it was not
 * (ADR 26).
 *
 * "Narrowed" is its own fact, never inferred from the list: a token whose
 * chosen spaces have all since been deleted has an empty list, and must reach
 * nothing rather than fall back to its issuer's whole reach.
 */
export type ChosenSpaces =
  | { readonly narrowed: false }
  | { readonly narrowed: true; readonly spaceIds: readonly UnitId[] };

/** No spaces chosen: the issuer's whole reach. */
export const WHOLE_REACH: ChosenSpaces = { narrowed: false };

const subtreesOf = (
  tops: readonly UnitId[],
  storageUnits: readonly Pick<SpaceInTree, "id" | "parentId">[],
): Set<UnitId> => {
  const childrenOf = new Map<UnitId, UnitId[]>();
  const known = new Set<UnitId>();
  for (const unit of storageUnits) {
    known.add(unit.id);
    if (unit.parentId !== null) {
      const siblings = childrenOf.get(unit.parentId) ?? [];
      siblings.push(unit.id);
      childrenOf.set(unit.parentId, siblings);
    }
  }

  const within = new Set<UnitId>();
  const pending = tops.filter((id) => known.has(id));
  while (pending.length > 0) {
    const id = pending.pop() as UnitId;
    if (within.has(id)) {
      continue;
    }
    within.add(id);
    pending.push(...(childrenOf.get(id) ?? []));
  }

  return within;
};

/**
 * What a machine token may reach (ADR 26): its issuer's access intersected
 * with the subtrees of the spaces chosen for it, computed on every request so
 * that nothing is copied. When the issuer loses a share, the token loses it.
 *
 * Each space keeps the issuer's level and never more; for an administrator,
 * whose access is everything, the chosen subtrees are reached at edit. The
 * token's scope (ADR 17) still applies on top, at the transport.
 */
export const narrowAccess = (
  access: Access,
  chosen: ChosenSpaces,
  storageUnits: readonly Pick<SpaceInTree, "id" | "parentId">[],
): Access => {
  if (!chosen.narrowed) {
    return access;
  }

  const spaces = new Map<UnitId, ShareLevel>();
  for (const id of subtreesOf(chosen.spaceIds, storageUnits)) {
    const level = access.kind === "everything" ? ShareLevel.EDIT : access.spaces.get(id);
    if (level !== undefined) {
      spaces.set(id, level);
    }
  }

  return { kind: "scoped", spaces, narrowed: true };
};

/**
 * The spaces chosen for a token, as they are kept: each once, in the order
 * given, and without any that lies inside another choice, which would add
 * nothing to the subtree already chosen.
 */
export const outermostChoices = (
  chosen: readonly UnitId[],
  storageUnits: readonly Pick<SpaceInTree, "id" | "parentId">[],
): UnitId[] => {
  const unique = [...new Set(chosen)];
  const parentOf = new Map(storageUnits.map((unit) => [unit.id, unit.parentId]));
  const picked = new Set(unique);

  const insideAnother = (id: UnitId): boolean => {
    const seen = new Set<UnitId>([id]);
    let parent = parentOf.get(id) ?? null;
    while (parent !== null && !seen.has(parent)) {
      if (picked.has(parent)) {
        return true;
      }
      seen.add(parent);
      parent = parentOf.get(parent) ?? null;
    }

    return false;
  };

  return unique.filter((id) => !insideAnother(id));
};

/** Whether the person may see a space and what it holds. */
export const mayViewSpace = (access: Access, id: UnitId): boolean =>
  access.kind === "everything" || access.spaces.has(id);

/** Whether the person may change a space and what it holds. */
export const mayEditSpace = (access: Access, id: UnitId): boolean =>
  access.kind === "everything" ||
  access.spaces.get(id) === ShareLevel.EDIT;

/**
 * The spaces at the top of the person's home screen, in the order given: every
 * space they may see whose parent they may not. A space shared from inside
 * someone else's tree is therefore a root for the person it was shared with.
 */
export const visibleRootsOf = (
  access: Access,
  storageUnits: readonly Pick<SpaceInTree, "id" | "parentId">[],
): UnitId[] =>
  storageUnits
    .filter(
      (unit) =>
        mayViewSpace(access, unit.id) &&
        (unit.parentId === null || !mayViewSpace(access, unit.parentId)),
    )
    .map((unit) => unit.id);

/**
 * A breadcrumb, root first, cut at the edge of what the person may see
 * (ADR 26). A space shared from inside somebody else's tree is a root for the
 * person it was shared with, so their breadcrumb starts there and never names
 * a space above it.
 *
 * Reach runs down the tree, so what may be seen of a path is always its tail:
 * the walk goes up from the far end and stops at the first space out of reach.
 */
export const cutPathToReach = <T extends { readonly id: UnitId }>(
  access: Access,
  path: readonly T[],
): T[] => {
  let start = path.length;
  while (start > 0 && mayViewSpace(access, (path[start - 1] as T).id)) {
    start -= 1;
  }

  return path.slice(start);
};

/**
 * Where a repository may look on a person's behalf (ADR 26), for the reads
 * that must filter inside the query rather than after it: anything cut to a
 * limit, where another person's rows would otherwise push this person's off
 * the page.
 */
export type SpaceReach =
  | { readonly kind: "everywhere" }
  | { readonly kind: "within"; readonly spaceIds: readonly UnitId[] };

/** The reach a person's access gives a query. */
export const reachOf = (access: Access): SpaceReach =>
  access.kind === "everything"
    ? { kind: "everywhere" }
    : { kind: "within", spaceIds: [...access.spaces.keys()] };

/** Whether a reach takes in a space. */
export const reaches = (reach: SpaceReach, id: UnitId): boolean =>
  reach.kind === "everywhere" || reach.spaceIds.includes(id);
