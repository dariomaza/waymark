import { describe, expect, it } from "vitest";

import {
  itemId,
  photoId,
  publicId,
  unitId,
  type ItemId,
  type PhotoId,
  type PublicId,
  type UnitId,
} from "./identity.js";

describe("domain identities", () => {
  it("keeps the underlying string value untouched", () => {
    expect(unitId("unit-1")).toBe("unit-1");
    expect(itemId("item-1")).toBe("item-1");
    expect(photoId("photo-1")).toBe("photo-1");
    expect(publicId("QRCODE1")).toBe("QRCODE1");
  });

  it("refuses a unit id where an item id is expected", () => {
    const takesItemId = (id: ItemId): ItemId => id;

    // @ts-expect-error a UnitId is not an ItemId
    takesItemId(unitId("unit-1"));
  });

  it("refuses a photo id where a public id is expected", () => {
    const takesPublicId = (id: PublicId): PublicId => id;

    // @ts-expect-error a PhotoId is not a PublicId
    takesPublicId(photoId("photo-1"));
  });

  it("refuses a bare string where a branded id is expected", () => {
    const takesUnitId = (id: UnitId): UnitId => id;
    const takesPhotoId = (id: PhotoId): PhotoId => id;

    // @ts-expect-error a plain string is not a UnitId
    takesUnitId("unit-1");
    // @ts-expect-error a plain string is not a PhotoId
    takesPhotoId("photo-1");
  });
});
