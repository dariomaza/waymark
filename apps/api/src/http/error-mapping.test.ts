import * as domain from "@ariadna/domain";
import {
  CyclicStorageUnitMove,
  DomainError,
  InvalidQuantity,
  ItemNotFound,
  MissingEmptyTarget,
  StorageUnitNotEmpty,
  StorageUnitNotFound,
  itemId,
  unitId,
} from "@ariadna/domain";
import { describe, expect, it } from "vitest";

import * as persistenceErrors from "../persistence/persistence-errors.js";
import {
  CorruptStorageUnitHierarchy,
  UnknownStorageUnitKind,
} from "../persistence/persistence-errors.js";
import { mapDomainError } from "./error-mapping.js";

const ADDRESSED = new Set(["addressed-unit", "addressed-item"]);
const NOTHING_ADDRESSED: ReadonlySet<string> = new Set();

describe("mapDomainError", () => {
  describe("not found (404) versus unprocessable reference (422)", () => {
    it("answers 404 when the missing unit is the one the URL addresses", () => {
      const mapped = mapDomainError(
        new StorageUnitNotFound(unitId("addressed-unit")),
        ADDRESSED,
      );

      expect(mapped?.status).toBe(404);
      expect(mapped?.code).toBe("STORAGE_UNIT_NOT_FOUND");
    });

    it("answers 422 when the missing unit was only referenced in the body", () => {
      // `POST /items` with a `storageUnitId` nobody created. The route exists,
      // so 404 would be a lie about the endpoint rather than about the id.
      const mapped = mapDomainError(
        new StorageUnitNotFound(unitId("a-unit-in-the-body")),
        ADDRESSED,
      );

      expect(mapped?.status).toBe(422);
      expect(mapped?.code).toBe("STORAGE_UNIT_NOT_FOUND");
    });

    it("answers 404 when the missing item is the one the URL addresses", () => {
      const mapped = mapDomainError(
        new ItemNotFound(itemId("addressed-item")),
        ADDRESSED,
      );

      expect(mapped?.status).toBe(404);
      expect(mapped?.code).toBe("ITEM_NOT_FOUND");
    });

    it("answers 422 for an unknown item inside a bulk move", () => {
      const mapped = mapDomainError(
        new ItemNotFound(itemId("an-item-in-the-body")),
        NOTHING_ADDRESSED,
      );

      expect(mapped?.status).toBe(422);
    });

    it("reports which id was missing, so a client can say what went wrong", () => {
      const mapped = mapDomainError(
        new StorageUnitNotFound(unitId("ghost")),
        NOTHING_ADDRESSED,
      );

      expect(mapped?.details).toEqual({ storageUnitId: "ghost" });
    });
  });

  describe("conflicts with the current state (409)", () => {
    it("answers 409 for a unit that still holds things (ADR 3)", () => {
      const mapped = mapDomainError(
        new StorageUnitNotEmpty(unitId("box"), 3, 1),
        ADDRESSED,
      );

      expect(mapped?.status).toBe(409);
      expect(mapped?.code).toBe("STORAGE_UNIT_NOT_EMPTY");
    });

    it("hands back the counts, so the UI can offer to empty into the parent", () => {
      const mapped = mapDomainError(
        new StorageUnitNotEmpty(unitId("box"), 3, 1),
        ADDRESSED,
      );

      expect(mapped?.details).toEqual({
        storageUnitId: "box",
        itemCount: 3,
        childUnitCount: 1,
      });
    });

    it("answers 409 for the three node cycle of ADR 2, not 500", () => {
      const mapped = mapDomainError(
        new CyclicStorageUnitMove(unitId("room"), unitId("box")),
        ADDRESSED,
      );

      expect(mapped?.status).toBe(409);
      expect(mapped?.code).toBe("CYCLIC_STORAGE_UNIT_MOVE");
      expect(mapped?.details).toEqual({
        storageUnitId: "room",
        targetParentId: "box",
      });
    });
  });

  describe("the request itself is wrong (422)", () => {
    it("answers 422 when emptying a root needs a target it was not given", () => {
      const mapped = mapDomainError(
        new MissingEmptyTarget(unitId("garage"), 4),
        ADDRESSED,
      );

      expect(mapped?.status).toBe(422);
      expect(mapped?.code).toBe("MISSING_EMPTY_TARGET");
      expect(mapped?.details).toEqual({ storageUnitId: "garage", itemCount: 4 });
    });

    it("answers 422 for a quantity the domain refuses", () => {
      const mapped = mapDomainError(new InvalidQuantity(0), ADDRESSED);

      expect(mapped?.status).toBe(422);
      expect(mapped?.code).toBe("INVALID_QUANTITY");
      expect(mapped?.details).toEqual({ quantity: 0 });
    });
  });

  describe("corrupt stored data (500)", () => {
    it("answers 500 for a stored cycle, because nothing the client sent is wrong", () => {
      const mapped = mapDomainError(
        new CorruptStorageUnitHierarchy(unitId("room"), "it loops"),
        ADDRESSED,
      );

      expect(mapped?.status).toBe(500);
      expect(mapped?.code).toBe("CORRUPT_STORAGE_UNIT_HIERARCHY");
    });

    it("answers 500 for a stored kind outside the domain's own set", () => {
      const mapped = mapDomainError(new UnknownStorageUnitKind("TARDIS"), ADDRESSED);

      expect(mapped?.status).toBe(500);
      expect(mapped?.code).toBe("UNKNOWN_STORAGE_UNIT_KIND");
    });

    it("says nothing about the stored data in a 500 detail payload", () => {
      const mapped = mapDomainError(new UnknownStorageUnitKind("TARDIS"), ADDRESSED);

      expect(mapped?.details).toBeUndefined();
    });
  });

  describe("completeness", () => {
    /**
     * The one test that keeps the promise "no domain error ever becomes an
     * accidental 500". A new error class added to the domain fails HERE, at the
     * moment it is written, instead of in production as an unexplained 500.
     */
    const everyDomainErrorClass = (
      module: Record<string, unknown>,
    ): { name: string; value: unknown }[] =>
      Object.entries(module)
        .filter(
          ([, value]) =>
            typeof value === "function" &&
            value !== DomainError &&
            Object.prototype.isPrototypeOf.call(
              DomainError,
              value as { prototype: unknown },
            ),
        )
        .map(([name, value]) => ({ name, value }));

    it("finds the domain error classes it is supposed to be checking", () => {
      const names = everyDomainErrorClass(domain).map((entry) => entry.name).sort();

      expect(names).toEqual([
        "CyclicStorageUnitMove",
        "InvalidQuantity",
        "ItemNotFound",
        "MissingEmptyTarget",
        "StorageUnitNotEmpty",
        "StorageUnitNotFound",
      ]);
    });

    it.each([
      ...everyDomainErrorClass(domain),
      ...everyDomainErrorClass(persistenceErrors),
    ])("maps $name to a deliberate status", ({ name, value }) => {
      const instance = Object.create(
        (value as { prototype: object }).prototype,
      ) as DomainError;

      const mapped = mapDomainError(instance, NOTHING_ADDRESSED);

      expect(mapped, `${name} has no entry in the mapping table`).not.toBeNull();
    });
  });

  describe("errors it knows nothing about", () => {
    it("returns null so the caller can log a real bug and answer 500", () => {
      class SomethingElse extends Error {}

      expect(
        mapDomainError(new SomethingElse() as unknown as DomainError, ADDRESSED),
      ).toBeNull();
    });
  });
});
