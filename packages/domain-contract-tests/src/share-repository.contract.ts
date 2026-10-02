import {
  ShareLevel,
  type Share,
  type ShareRepository,
} from "@waymark/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AN_OWNER, ANOTHER_OWNER, aStorageUnit } from "./builders.js";
import type { RepositoryHarness, ShareRepositoryContext } from "./harness.js";

const byPair = (left: Share, right: Share): number =>
  `${left.storageUnitId}/${left.userId}`.localeCompare(
    `${right.storageUnitId}/${right.userId}`,
  );

/**
 * The behaviour every `ShareRepository` owes its callers (ADR 26), run against
 * the in-memory fake and against Prisma.
 */
export const shareRepositoryContract = (
  harness: RepositoryHarness<ShareRepositoryContext>,
): void => {
  describe(`ShareRepository contract (${harness.name})`, () => {
    let shares: ShareRepository;

    const garage = aStorageUnit("garage");
    const shelf = aStorageUnit("shelf", { parentId: garage.id });

    beforeEach(async () => {
      const context = await harness.setUp();
      shares = context.shares;
      // A share is on a space, which a database holds to as a foreign key.
      await context.storageUnits.saveAll([garage, shelf]);
    });

    afterEach(async () => {
      await harness.tearDown();
    });

    const all = async (): Promise<Share[]> =>
      [...(await shares.findAll())].sort(byPair);

    it("holds nothing before anything is shared", async () => {
      expect(await shares.findAll()).toEqual([]);
    });

    it("keeps a share it was given", async () => {
      const share: Share = {
        storageUnitId: shelf.id,
        userId: ANOTHER_OWNER,
        access: ShareLevel.VIEW,
      };

      await shares.set(share);

      expect(await shares.findAll()).toEqual([share]);
    });

    it("keeps one share per space and person, so setting it again changes the level", async () => {
      await shares.set({
        storageUnitId: garage.id,
        userId: ANOTHER_OWNER,
        access: ShareLevel.VIEW,
      });

      await shares.set({
        storageUnitId: garage.id,
        userId: ANOTHER_OWNER,
        access: ShareLevel.EDIT,
      });

      expect(await shares.findAll()).toEqual([
        { storageUnitId: garage.id, userId: ANOTHER_OWNER, access: ShareLevel.EDIT },
      ]);
    });

    it("keeps shares of one space with two people, and of two spaces with one", async () => {
      const given: Share[] = [
        { storageUnitId: garage.id, userId: AN_OWNER, access: ShareLevel.VIEW },
        { storageUnitId: garage.id, userId: ANOTHER_OWNER, access: ShareLevel.EDIT },
        { storageUnitId: shelf.id, userId: ANOTHER_OWNER, access: ShareLevel.VIEW },
      ];

      for (const share of given) {
        await shares.set(share);
      }

      expect(await all()).toEqual([...given].sort(byPair));
    });

    it("removes exactly the share it is told to", async () => {
      await shares.set({
        storageUnitId: garage.id,
        userId: ANOTHER_OWNER,
        access: ShareLevel.EDIT,
      });
      await shares.set({
        storageUnitId: shelf.id,
        userId: ANOTHER_OWNER,
        access: ShareLevel.VIEW,
      });
      await shares.set({
        storageUnitId: garage.id,
        userId: AN_OWNER,
        access: ShareLevel.VIEW,
      });

      await shares.remove(garage.id, ANOTHER_OWNER);

      expect(await all()).toEqual(
        [
          { storageUnitId: shelf.id, userId: ANOTHER_OWNER, access: ShareLevel.VIEW },
          { storageUnitId: garage.id, userId: AN_OWNER, access: ShareLevel.VIEW },
        ].sort(byPair),
      );
    });

    it("shrugs at removing a share that was never there", async () => {
      await expect(shares.remove(garage.id, ANOTHER_OWNER)).resolves.toBeUndefined();
    });
  });
};
