import { describe, expect, it } from "vitest";

import { unitId, userId, type UserId } from "../shared/identity.js";
import { narrowAccess, resolveAccess, Role, ShareLevel, type Access, type SpaceInTree } from "./access.js";
import {
  isSharedWith,
  mayActAtTheTop,
  mayMakeRoot,
  ownerNamedBy,
  permissionsOn,
} from "./space-permissions.js";

const ana = userId("ana");
const bea = userId("bea");
const ada = userId("ada");

const space = (id: string, parentId: string | null, ownerId: UserId | null = null): SpaceInTree => ({
  id: unitId(id),
  parentId: parentId === null ? null : unitId(parentId),
  ownerId,
});

/**
 * Ana's house holds a garage, the garage a shelf, the shelf a box. The attic is
 * in the house too. Bea may view the garage and edit the shelf inside it, and
 * may edit the attic.
 */
const house = space("house", null, ana);
const garage = space("garage", "house");
const shelf = space("shelf", "garage");
const box = space("box", "shelf");
const attic = space("attic", "house");
const household = [house, garage, shelf, box, attic];

const shares = [
  { storageUnitId: unitId("garage"), userId: bea, access: ShareLevel.VIEW },
  { storageUnitId: unitId("shelf"), userId: bea, access: ShareLevel.EDIT },
  { storageUnitId: unitId("attic"), userId: bea, access: ShareLevel.EDIT },
];

const accessOf = (who: UserId, role: Role = Role.USER): Access =>
  resolveAccess({ caller: { userId: who, role }, storageUnits: household, shares });

const EVERYTHING = accessOf(ada, Role.ADMINISTRATOR);

describe("what a person may do with a space they can see (ADR 26)", () => {
  describe("their level on it", () => {
    it("is edit for the owner, everywhere in the tree", () => {
      expect(permissionsOn(accessOf(ana), ana, box, ana).access).toBe(ShareLevel.EDIT);
    });

    it("is view on a space shared to view, and edit on a space inside it shared to edit", () => {
      const bea_ = accessOf(bea);

      expect(permissionsOn(bea_, bea, garage, null).access).toBe(ShareLevel.VIEW);
      expect(permissionsOn(bea_, bea, shelf, null).access).toBe(ShareLevel.EDIT);
    });

    it("is edit for an administrator, in anybody's tree", () => {
      expect(permissionsOn(EVERYTHING, ada, garage, ana).access).toBe(ShareLevel.EDIT);
    });
  });

  describe("whether it may be moved from where it is", () => {
    it("may, for the owner, anywhere in the tree, the root included", () => {
      expect(permissionsOn(accessOf(ana), ana, house, ana).mayMove).toBe(true);
      expect(permissionsOn(accessOf(ana), ana, box, ana).mayMove).toBe(true);
    });

    it("may not, in a space shared to view", () => {
      expect(permissionsOn(accessOf(bea), bea, garage, null).mayMove).toBe(false);
    });

    it("may not, out of a space shared to view, even when the space itself is shared to edit", () => {
      // The shelf leaves the garage, which Bea may only look at.
      expect(permissionsOn(accessOf(bea), bea, shelf, null).mayMove).toBe(false);
    });

    it("may, inside a space shared to edit", () => {
      expect(permissionsOn(accessOf(bea), bea, box, null).mayMove).toBe(true);
    });

    it("may not, for a space shared to edit that is at the top of what the person sees", () => {
      // Taking the attic out of Ana's house is Ana's to do (OWNER_ONLY).
      expect(permissionsOn(accessOf(bea), bea, attic, null).mayMove).toBe(false);
    });
  });

  describe("whether it may become a top-level space", () => {
    it("may, for the owner, below the root", () => {
      expect(permissionsOn(accessOf(ana), ana, box, ana).mayMoveToTop).toBe(true);
    });

    it("may stay one, for the owner of a root", () => {
      expect(permissionsOn(accessOf(ana), ana, house, ana).mayMoveToTop).toBe(true);
    });

    it("may not, for somebody it was shared with to edit", () => {
      expect(permissionsOn(accessOf(bea), bea, box, null).mayMoveToTop).toBe(false);
    });

    it("may, for an administrator, in anybody's tree", () => {
      expect(permissionsOn(EVERYTHING, ada, box, ana).mayMoveToTop).toBe(true);
    });

    it("may not, for a token narrowed to chosen spaces, even its issuer's own tree", () => {
      const narrowed = narrowAccess(
        accessOf(ana),
        { narrowed: true, spaceIds: [unitId("garage")] },
        household,
      );

      expect(permissionsOn(narrowed, ana, box, ana).mayMoveToTop).toBe(false);
    });
  });
});

describe("acting at the top of the tree (ADR 26)", () => {
  it("is for the tree's owner and an administrator", () => {
    expect(mayActAtTheTop(accessOf(ana), ana, ana)).toBe(true);
    expect(mayActAtTheTop(EVERYTHING, ada, ana)).toBe(true);
  });

  it("is not for somebody else, nor for a tree whose owner they may not know", () => {
    expect(mayActAtTheTop(accessOf(bea), bea, ana)).toBe(false);
    expect(mayActAtTheTop(accessOf(bea), bea, null)).toBe(false);
  });

  it("makes a root for anybody but a narrowed token", () => {
    expect(mayMakeRoot(accessOf(bea))).toBe(true);
    expect(mayMakeRoot(EVERYTHING)).toBe(true);
    expect(
      mayMakeRoot(narrowAccess(accessOf(ana), { narrowed: true, spaceIds: [] }, household)),
    ).toBe(false);
  });
});

describe("whose a visible tree is (ADR 26)", () => {
  it("is named by a real root", () => {
    expect(ownerNamedBy(house)).toBe(ana);
  });

  it("is named by nothing when the person's top is a space shared from inside a tree", () => {
    expect(ownerNamedBy(garage)).toBeNull();
  });

  it("is shared with a person who does not own it, and never with an administrator", () => {
    expect(isSharedWith(accessOf(bea), bea, null)).toBe(true);
    expect(isSharedWith(accessOf(ana), ana, ana)).toBe(false);
    expect(isSharedWith(EVERYTHING, ada, ana)).toBe(false);
  });
});
