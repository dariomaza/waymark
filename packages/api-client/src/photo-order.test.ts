import { photoId } from "@ariadna/domain";
import { describe, expect, it } from "vitest";

import { movedEarlier, withCoverFirst } from "./photo-order.js";

const order = [photoId("a"), photoId("b"), photoId("c")];

describe("the order of an item's photos", () => {
  /**
   * There is no `coverPhotoId` to set, in the API or in either client: the
   * cover IS `photos[0]` (ADR 9), so choosing one is spelled as a reorder.
   */
  it("makes a photo the cover by putting it first", () => {
    expect(withCoverFirst(order, photoId("c"))).toEqual([
      photoId("c"),
      photoId("a"),
      photoId("b"),
    ]);
  });

  it("swaps a photo with the one before it", () => {
    expect(movedEarlier(order, photoId("c"))).toEqual([
      photoId("a"),
      photoId("c"),
      photoId("b"),
    ]);
  });

  it("leaves the cover where it is", () => {
    expect(movedEarlier(order, photoId("a"))).toEqual(order);
  });

  it("leaves an order it does not recognise alone", () => {
    expect(movedEarlier(order, photoId("zzz"))).toEqual(order);
  });
});
