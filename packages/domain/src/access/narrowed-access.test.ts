import { describe, expect, it } from "vitest";

import { unitId, userId, type UserId } from "../shared/identity.js";
import {
  ShareLevel,
  WHOLE_REACH,
  mayEditSpace,
  mayViewSpace,
  narrowAccess,
  outermostChoices,
  resolveAccess,
  Role,
  type Access,
  type ChosenSpaces,
  type ShareOfSpace,
  type SpaceInTree,
} from "./access.js";

const ana = userId("ana");
const bea = userId("bea");
const admin = userId("admin");

const space = (id: string, parentId: string | null, ownerId: UserId | null = null): SpaceInTree => ({
  id: unitId(id),
  parentId: parentId === null ? null : unitId(parentId),
  ownerId,
});

/**
 * Ana's house holds a garage (a shelf on it) and an attic; Bea's flat holds a
 * wardrobe. Bea may view the garage and edit the attic.
 */
const tree: readonly SpaceInTree[] = [
  space("house", null, ana),
  space("garage", "house"),
  space("shelf", "garage"),
  space("attic", "house"),
  space("flat", null, bea),
  space("wardrobe", "flat"),
];

const shares: readonly ShareOfSpace[] = [
  { storageUnitId: unitId("garage"), userId: bea, access: ShareLevel.VIEW },
  { storageUnitId: unitId("attic"), userId: bea, access: ShareLevel.EDIT },
];

const accessOf = (who: UserId, role: Role = Role.USER, sharing = shares): Access =>
  resolveAccess({ caller: { userId: who, role }, storageUnits: tree, shares: sharing });

const narrowedTo = (...ids: string[]): ChosenSpaces => ({
  narrowed: true,
  spaceIds: ids.map(unitId),
});

const seen = (access: Access): string[] =>
  tree.filter((unit) => mayViewSpace(access, unit.id)).map((unit) => unit.id).sort();

describe("a machine token narrowed to chosen spaces (ADR 26)", () => {
  it("reaches the issuer's whole reach when nothing was chosen", () => {
    const issuer = accessOf(bea);

    expect(narrowAccess(issuer, WHOLE_REACH, tree)).toBe(issuer);
  });

  it("reaches only the chosen spaces and what is under them", () => {
    const token = narrowAccess(accessOf(ana), narrowedTo("garage"), tree);

    expect(seen(token)).toEqual(["garage", "shelf"]);
  });

  it("keeps the issuer's level in each space, never more", () => {
    const token = narrowAccess(accessOf(bea), narrowedTo("garage", "attic"), tree);

    expect(mayViewSpace(token, unitId("shelf"))).toBe(true);
    expect(mayEditSpace(token, unitId("shelf"))).toBe(false);
    expect(mayEditSpace(token, unitId("attic"))).toBe(true);
  });

  /** An intersection, not a union: a chosen space the issuer cannot reach adds nothing. */
  it("reaches nothing the issuer cannot reach, even inside a chosen space", () => {
    const token = narrowAccess(accessOf(bea), narrowedTo("house"), tree);

    expect(seen(token)).toEqual(["attic", "garage", "shelf"]);
  });

  it("loses a share the moment its issuer does, because nothing was copied", () => {
    const withoutTheAttic = accessOf(bea, Role.USER, [shares[0] as ShareOfSpace]);

    expect(seen(narrowAccess(withoutTheAttic, narrowedTo("attic", "flat"), tree))).toEqual([
      "flat",
      "wardrobe",
    ]);
  });

  it("gives an administrator's token the chosen subtrees at edit, and nothing else", () => {
    const token = narrowAccess(accessOf(admin, Role.ADMINISTRATOR), narrowedTo("attic"), tree);

    expect(seen(token)).toEqual(["attic"]);
    expect(mayEditSpace(token, unitId("attic"))).toBe(true);
  });

  /**
   * The edge the whole design is shaped around. A narrowed token whose chosen
   * spaces have all been deleted must not fall back to "nothing chosen".
   */
  it("reaches nothing when every chosen space is gone", () => {
    const token = narrowAccess(accessOf(ana), { narrowed: true, spaceIds: [] }, tree);

    expect(seen(token)).toEqual([]);
  });

  it("reaches nothing for a chosen space that no longer exists", () => {
    const token = narrowAccess(accessOf(ana), narrowedTo("demolished"), tree);

    expect(seen(token)).toEqual([]);
  });

  it("says it was narrowed, so it is kept off the top of the tree", () => {
    expect(narrowAccess(accessOf(ana), narrowedTo("garage"), tree)).toMatchObject({
      kind: "scoped",
      narrowed: true,
    });
    expect(accessOf(ana)).toMatchObject({ kind: "scoped", narrowed: false });
  });
});

describe("the spaces somebody chose for a token", () => {
  it("keeps each once, in the order given", () => {
    expect(outermostChoices(["attic", "garage", "attic"].map(unitId), tree)).toEqual([
      unitId("attic"),
      unitId("garage"),
    ]);
  });

  it("drops a choice inside another choice, which adds nothing", () => {
    expect(outermostChoices(["shelf", "house", "wardrobe"].map(unitId), tree)).toEqual([
      unitId("house"),
      unitId("wardrobe"),
    ]);
  });
});
