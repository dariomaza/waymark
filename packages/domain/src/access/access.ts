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
 */
export type Access =
  | { readonly kind: "everything" }
  | {
      readonly kind: "scoped";
      readonly spaces: ReadonlyMap<UnitId, ShareLevel>;
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

  return { kind: "scoped", spaces };
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
