import {
  CreateItem,
  CreateStorageUnit,
  EmptyStorageUnit,
  GetStorageUnit,
  ListItems,
  ListStorageUnits,
  MoveStorageUnit,
  narrowAccess,
  OutsideTokenSpaces,
  Role,
  SearchInventory,
  SpaceIsViewOnly,
  StorageUnitKind,
  StorageUnitNotFound,
  unitId,
  type Access,
  type ChosenSpaces,
  type UnitId,
  type UserId,
} from "@waymark/domain";
import {
  FakeClock,
  SequentialIdGenerator,
  SequentialPublicIdGenerator,
} from "@waymark/domain/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { A_MOMENT, aStorageUnit } from "./builders.js";
import type { InvisibilityContext, RepositoryHarness } from "./harness.js";
import {
  accessIn,
  ADMIN,
  ANA,
  BEA,
  ITEMS,
  NAMES_HIDDEN_FROM_BEA,
  namesIn,
  seedHousehold,
  sortedIdsOf,
  SPACES,
} from "./invisibility.fixture.js";

/**
 * # A machine token narrowed to chosen spaces (ADR 26)
 *
 * The household of the invisibility fixture, seen through a token. A token
 * reaches its issuer's access intersected with the subtrees of the spaces
 * chosen for it, resolved from what is stored at the moment it is used, and
 * it never acts outside those spaces: not at the top of the tree, not in its
 * issuer's own spaces that were not chosen.
 *
 * The token's scope (read or read-write) is enforced at the transport, by
 * HTTP method (ADR 17), so it is the API's e2e suite that holds it on top.
 */
export const aNarrowedTokenContract = (
  harness: RepositoryHarness<InvisibilityContext>,
): void => {
  describe(`A machine token narrowed to chosen spaces (${harness.name})`, () => {
    let context: InvisibilityContext;
    const clock = new FakeClock(A_MOMENT);

    beforeEach(async () => {
      context = await harness.setUp();
      await seedHousehold(context);
    });

    afterEach(async () => {
      await harness.tearDown();
    });

    const chosen = (...ids: UnitId[]): ChosenSpaces => ({ narrowed: true, spaceIds: ids });

    const tokenOf = async (
      who: UserId,
      spaces: ChosenSpaces,
      role: Role = Role.USER,
    ): Promise<Access> =>
      narrowAccess(await accessIn(context, who, role), spaces, await context.storageUnits.findAll());

    const tree = async (access: Access) =>
      sortedIdsOf(await new ListStorageUnits({ storageUnits: context.storageUnits }).execute(access));

    const open = (access: Access, id: UnitId) =>
      new GetStorageUnit({ storageUnits: context.storageUnits, items: context.items }).execute(
        access,
        id,
      );

    const use = () => {
      const { storageUnits, items } = context;
      const ids = new SequentialIdGenerator("narrowed");

      return {
        createStorageUnit: new CreateStorageUnit({
          storageUnits,
          ids,
          publicIds: new SequentialPublicIdGenerator(),
          clock,
        }),
        createItem: new CreateItem({ items, storageUnits, ids, clock }),
        moveStorageUnit: new MoveStorageUnit({ storageUnits, clock }),
        emptyStorageUnit: new EmptyStorageUnit({ storageUnits, items, clock }),
      };
    };

    describe("Bea's token narrowed to the garage shared with her", () => {
      const beasGarageToken = () => tokenOf(BEA, chosen(SPACES.garage.id));

      it("reads only that subtree", async () => {
        const token = await beasGarageToken();

        expect(await tree(token)).toEqual(["ana-garage", "ana-shelf"]);
        const rows = await new ListItems({
          items: context.items,
          storageUnits: context.storageUnits,
        }).execute(token);
        expect(sortedIdsOf(rows.map((row) => row.item))).toEqual([ITEMS.drill.id]);
      });

      it("does not see Bea's own tree outside it, as if it did not exist", async () => {
        const token = await beasGarageToken();

        await expect(open(token, SPACES.flat.id)).rejects.toBeInstanceOf(StorageUnitNotFound);
        await expect(open(token, SPACES.attic.id)).rejects.toBeInstanceOf(StorageUnitNotFound);
      });

      it("finds nothing outside it, nor anything Bea may not see", async () => {
        const found = await new SearchInventory({
          search: context.search,
          storageUnits: context.storageUnits,
        }).execute(await beasGarageToken(), { query: "a" });

        expect(sortedIdsOf(found.items.map((result) => result.item))).toEqual([ITEMS.drill.id]);
        expect(namesIn(found, [...NAMES_HIDDEN_FROM_BEA, "Bea flat", "Bea scarf"])).toEqual([]);
      });

      it("may not change it, because Bea may only view it", async () => {
        await expect(
          use().createItem.execute(await beasGarageToken(), {
            storageUnitId: SPACES.shelf.id,
            name: "New thing",
          }),
        ).rejects.toBeInstanceOf(SpaceIsViewOnly);
      });
    });

    describe("Bea's token narrowed to the attic she may edit", () => {
      it("may change it, because Bea may", async () => {
        const token = await tokenOf(BEA, chosen(SPACES.attic.id));

        const made = await use().createItem.execute(token, {
          storageUnitId: SPACES.attic.id,
          name: "New thing",
        });

        expect(made.storageUnitId).toBe(SPACES.attic.id);
      });

      it("may not change Bea's own flat, which was not chosen", async () => {
        const token = await tokenOf(BEA, chosen(SPACES.attic.id));

        await expect(
          use().createItem.execute(token, { storageUnitId: SPACES.wardrobe.id, name: "New thing" }),
        ).rejects.toBeInstanceOf(StorageUnitNotFound);
      });

      it("loses the attic the moment Bea loses its share, because nothing was copied", async () => {
        await context.shares.remove(SPACES.attic.id, BEA);

        expect(await tree(await tokenOf(BEA, chosen(SPACES.attic.id)))).toEqual([]);
      });
    });

    it("gives an administrator's token narrowed to Ana's unshared safe only that safe", async () => {
      const token = await tokenOf(ADMIN, chosen(SPACES.safe.id), Role.ADMINISTRATOR);

      expect(await tree(token)).toEqual(["ana-jewels", "ana-safe"]);
      await expect(open(token, SPACES.flat.id)).rejects.toBeInstanceOf(StorageUnitNotFound);
    });

    it("reaches nothing once every chosen space has been deleted", async () => {
      await context.storageUnits.save(
        aStorageUnit("bea-drawer", { name: "Bea drawer", parentId: SPACES.flat.id }),
      );
      await context.storageUnits.delete(unitId("bea-drawer"));

      expect(await tree(await tokenOf(BEA, chosen(unitId("bea-drawer"))))).toEqual([]);
    });

    /**
     * The top of the tree is outside every chosen space, so a narrowed token
     * may not make a root or move anything to or from the top, even where its
     * issuer, who owns the tree, could.
     */
    describe("the top of the tree, which is outside the chosen spaces", () => {
      const anasGarageAndAttic = () => tokenOf(ANA, chosen(SPACES.garage.id, SPACES.attic.id));

      it("may not make a root", async () => {
        await expect(
          use().createStorageUnit.execute(await anasGarageAndAttic(), {
            callerId: ANA,
            parentId: null,
            name: "New root",
            kind: StorageUnitKind.ROOM,
          }),
        ).rejects.toBeInstanceOf(OutsideTokenSpaces);
      });

      it("may not move a space to the top", async () => {
        await expect(
          use().moveStorageUnit.execute(await anasGarageAndAttic(), {
            callerId: ANA,
            id: SPACES.shelf.id,
            targetParentId: null,
          }),
        ).rejects.toBeInstanceOf(OutsideTokenSpaces);
        expect((await context.storageUnits.findById(SPACES.shelf.id))?.parentId).toBe(
          SPACES.garage.id,
        );
      });

      it("may not take a chosen space from the top, out of the house it stands in", async () => {
        await expect(
          use().moveStorageUnit.execute(await anasGarageAndAttic(), {
            callerId: ANA,
            id: SPACES.garage.id,
            targetParentId: SPACES.attic.id,
          }),
        ).rejects.toBeInstanceOf(OutsideTokenSpaces);
      });

      it("may not empty a chosen space's spaces to the top", async () => {
        await expect(
          use().emptyStorageUnit.execute(await tokenOf(ANA, chosen(SPACES.house.id)), {
            callerId: ANA,
            id: SPACES.house.id,
          }),
        ).rejects.toBeInstanceOf(OutsideTokenSpaces);
      });

      it("may still move a space inside its chosen spaces", async () => {
        const moved = await use().moveStorageUnit.execute(await anasGarageAndAttic(), {
          callerId: ANA,
          id: SPACES.shelf.id,
          targetParentId: SPACES.attic.id,
        });

        expect(moved.parentId).toBe(SPACES.attic.id);
      });

      it("leaves Ana herself free to make a root", async () => {
        const made = await use().createStorageUnit.execute(await accessIn(context, ANA), {
          callerId: ANA,
          parentId: null,
          name: "New root",
          kind: StorageUnitKind.ROOM,
        });

        expect(made.parentId).toBeNull();
      });
    });
  });
};
