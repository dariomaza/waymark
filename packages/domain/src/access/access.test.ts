import { describe, expect, it } from "vitest";

import { unitId, userId, type UnitId, type UserId } from "../shared/identity.js";
import {
  mayEditSpace,
  mayViewSpace,
  resolveAccess,
  Role,
  ShareLevel,
  visibleRootsOf,
  type Access,
  type ResolveAccessInput,
  type ShareOfSpace,
  type SpaceInTree,
} from "./access.js";

const ana = userId("ana");
const ben = userId("ben");
const cleo = userId("cleo");
const ada = userId("ada");

const space = (
  id: string,
  parentId: string | null,
  ownerId: UserId | null = null,
): SpaceInTree => ({
  id: unitId(id),
  parentId: parentId === null ? null : unitId(parentId),
  ownerId,
});

/**
 * Ana's garage holds a shelf, the shelf a box, the box a jar; a toolbox sits on
 * the garage floor. Ben's attic holds a trunk. Nobody owns the shed's contents
 * but Cleo.
 */
const household: readonly SpaceInTree[] = [
  space("garage", null, ana),
  space("shelf", "garage"),
  space("box", "shelf"),
  space("jar", "box"),
  space("toolbox", "garage"),
  space("attic", null, ben),
  space("trunk", "attic"),
  space("shed", null, cleo),
];

const share = (
  storageUnitId: string,
  to: UserId,
  access: ShareLevel,
): ShareOfSpace => ({ storageUnitId: unitId(storageUnitId), userId: to, access });

const accessOf = (
  who: UserId,
  shares: readonly ShareOfSpace[] = [],
  options: Partial<ResolveAccessInput> = {},
): Access =>
  resolveAccess({
    caller: { userId: who, role: Role.USER },
    storageUnits: household,
    shares,
    ...options,
  });

const levelsOf = (access: Access): Record<string, ShareLevel> => {
  if (access.kind === "everything") {
    throw new Error("expected scoped access");
  }
  return Object.fromEntries(access.spaces);
};

const ids = (...names: string[]): UnitId[] => names.map(unitId);

describe("what a person may see", () => {
  it("an administrator sees and edits everything, owned by anyone", () => {
    const access = resolveAccess({
      caller: { userId: ada, role: Role.ADMINISTRATOR },
      storageUnits: household,
      shares: [],
    });

    expect(access).toEqual({ kind: "everything" });
    expect(mayViewSpace(access, unitId("trunk"))).toBe(true);
    expect(mayEditSpace(access, unitId("jar"))).toBe(true);
    expect(visibleRootsOf(access, household)).toEqual(
      ids("garage", "attic", "shed"),
    );
  });

  it("an owner sees and edits their whole tree, however deep", () => {
    const access = accessOf(ana);

    expect(levelsOf(access)).toEqual({
      garage: ShareLevel.EDIT,
      shelf: ShareLevel.EDIT,
      box: ShareLevel.EDIT,
      jar: ShareLevel.EDIT,
      toolbox: ShareLevel.EDIT,
    });
    expect(mayEditSpace(access, unitId("jar"))).toBe(true);
    expect(visibleRootsOf(access, household)).toEqual(ids("garage"));
  });

  it("nobody sees another person's tree that was not shared with them", () => {
    const access = accessOf(ana);

    expect(mayViewSpace(access, unitId("attic"))).toBe(false);
    expect(mayViewSpace(access, unitId("trunk"))).toBe(false);
    expect(mayEditSpace(access, unitId("trunk"))).toBe(false);
  });

  it("a person sees a shelf shared with them and everything inside it, but not the garage around it", () => {
    const access = accessOf(ben, [share("shelf", ben, ShareLevel.VIEW)]);

    expect(levelsOf(access)).toEqual({
      attic: ShareLevel.EDIT,
      trunk: ShareLevel.EDIT,
      shelf: ShareLevel.VIEW,
      box: ShareLevel.VIEW,
      jar: ShareLevel.VIEW,
    });
    expect(mayViewSpace(access, unitId("garage"))).toBe(false);
    expect(mayViewSpace(access, unitId("toolbox"))).toBe(false);
  });

  it("a person who may only view a shared shelf may not edit anything in it", () => {
    const access = accessOf(ben, [share("shelf", ben, ShareLevel.VIEW)]);

    expect(mayViewSpace(access, unitId("jar"))).toBe(true);
    expect(mayEditSpace(access, unitId("shelf"))).toBe(false);
    expect(mayEditSpace(access, unitId("jar"))).toBe(false);
  });

  it("a person who may view the garage and edit one box edits only that box and what it holds", () => {
    const access = accessOf(ben, [
      share("garage", ben, ShareLevel.VIEW),
      share("box", ben, ShareLevel.EDIT),
    ]);

    expect(mayEditSpace(access, unitId("box"))).toBe(true);
    expect(mayEditSpace(access, unitId("jar"))).toBe(true);
    expect(mayEditSpace(access, unitId("shelf"))).toBe(false);
    expect(mayEditSpace(access, unitId("garage"))).toBe(false);
    expect(mayViewSpace(access, unitId("toolbox"))).toBe(true);
  });

  it("an edit share is not narrowed by a view share given later on a space above it", () => {
    const access = accessOf(ben, [
      share("box", ben, ShareLevel.EDIT),
      share("garage", ben, ShareLevel.VIEW),
    ]);

    expect(mayEditSpace(access, unitId("jar"))).toBe(true);
    expect(mayEditSpace(access, unitId("shelf"))).toBe(false);
  });

  it("an edit share is not narrowed by a view share on the same space", () => {
    const access = accessOf(ben, [
      share("shelf", ben, ShareLevel.EDIT),
      share("shelf", ben, ShareLevel.VIEW),
    ]);

    expect(mayEditSpace(access, unitId("shelf"))).toBe(true);
  });

  it("an owner keeps editing their own tree when it is also shared with them for viewing", () => {
    const access = accessOf(ana, [share("shelf", ana, ShareLevel.VIEW)]);

    expect(mayEditSpace(access, unitId("box"))).toBe(true);
  });

  it("a space shared with someone else is not visible to the person asking", () => {
    const access = accessOf(ben, [share("shelf", cleo, ShareLevel.EDIT)]);

    expect(mayViewSpace(access, unitId("shelf"))).toBe(false);
    expect(mayViewSpace(access, unitId("jar"))).toBe(false);
  });

  it("a shared inner space is a root for the person it is shared with, and its parent is not", () => {
    const access = accessOf(ben, [share("box", ben, ShareLevel.VIEW)]);

    expect(visibleRootsOf(access, household)).toEqual(ids("box", "attic"));
    expect(mayViewSpace(access, unitId("shelf"))).toBe(false);
  });

  it("a space shared inside another shared space is not a root of its own", () => {
    const access = accessOf(ben, [
      share("garage", ben, ShareLevel.VIEW),
      share("box", ben, ShareLevel.EDIT),
    ]);

    expect(visibleRootsOf(access, household)).toEqual(ids("garage", "attic"));
  });

  it("a person who owns nothing and has nothing shared with them sees nothing", () => {
    const access = accessOf(userId("newcomer"));

    expect(levelsOf(access)).toEqual({});
    expect(visibleRootsOf(access, household)).toEqual([]);
    expect(mayViewSpace(access, unitId("garage"))).toBe(false);
  });

  it("a share on a space that no longer exists grants nothing", () => {
    const access = accessOf(ben, [share("gone", ben, ShareLevel.EDIT)]);

    expect(mayViewSpace(access, unitId("gone"))).toBe(false);
  });

  it("a share reaches the bottom of a deeply nested tree", () => {
    const depth = 200;
    const deep: SpaceInTree[] = [space("level-0", null, ana)];
    for (let level = 1; level <= depth; level += 1) {
      deep.push(space(`level-${level}`, `level-${level - 1}`));
    }

    const access = accessOf(ben, [share("level-3", ben, ShareLevel.VIEW)], {
      storageUnits: deep,
    });

    expect(mayViewSpace(access, unitId(`level-${depth}`))).toBe(true);
    expect(mayViewSpace(access, unitId("level-2"))).toBe(false);
    expect(visibleRootsOf(access, deep)).toEqual(ids("level-3"));
  });
});
