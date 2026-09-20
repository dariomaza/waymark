import { describe, expect, it } from "vitest";

import * as domain from "./index.js";

describe("@ariadna/domain public surface", () => {
  it("exposes every use case", () => {
    expect(Object.keys(domain)).toEqual(
      expect.arrayContaining([
        "CreateStorageUnit",
        "MoveStorageUnit",
        "DeleteStorageUnit",
        "EmptyStorageUnit",
        "GetStorageUnitPath",
        "CreateItem",
        "MoveItems",
        "DeleteItem",
        "AttachItemPhoto",
        "DetachItemPhoto",
        "ReorderItemPhotos",
        "SetStorageUnitPhoto",
      ]),
    );
  });

  it("exposes every domain error", () => {
    expect(Object.keys(domain)).toEqual(
      expect.arrayContaining([
        "DomainError",
        "StorageUnitNotFound",
        "ItemNotFound",
        "CyclicStorageUnitMove",
        "StorageUnitNotEmpty",
        "InvalidQuantity",
        "MissingEmptyTarget",
        "TooManyItemPhotos",
        "PhotoNotOnItem",
      ]),
    );
  });

  it("exposes the entity factories and enumerations", () => {
    expect(Object.keys(domain)).toEqual(
      expect.arrayContaining([
        "createStorageUnit",
        "createItem",
        "createPhoto",
        "StorageUnitKind",
        "PhotoProcessingStatus",
        "unitId",
        "itemId",
        "photoId",
        "publicId",
      ]),
    );
  });

  it("does not leak the in-memory test doubles", () => {
    expect(Object.keys(domain)).not.toContain("InMemoryItemRepository");
    expect(Object.keys(domain)).not.toContain("InMemoryPhotoRepository");
    expect(Object.keys(domain)).not.toContain("InMemoryStorageUnitRepository");
    expect(Object.keys(domain)).not.toContain("FakeClock");
  });
});
