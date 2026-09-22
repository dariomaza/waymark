import { describe, expect, it } from "vitest";

import { publicIdFromScannedText } from "./scanned-label.js";

describe("reading a scanned label", () => {
  it("takes the code out of the URL a label encodes", () => {
    expect(publicIdFromScannedText("https://waymark.example/u/7ZK3QWERTY")).toBe(
      "7ZK3QWERTY",
    );
  });

  it("reads a label printed before the public base URL moved", () => {
    // `WAYMARK_PUBLIC_BASE_URL` is a server setting and the stickers in the
    // garage keep whatever it was when they were printed. A client that only
    // accepted its own origin would stop reading them.
    expect(publicIdFromScannedText("http://old-host.lan:5173/u/7ZK3QWERTY")).toBe(
      "7ZK3QWERTY",
    );
  });

  it("accepts the code printed under the symbol, typed in by hand", () => {
    // Which is the whole reason it is printed there: a scuffed label is read
    // out across a garage rather than reprinted.
    expect(publicIdFromScannedText(" 7zk3qwerty ")).toBe("7ZK3QWERTY");
  });

  it("refuses anything that is not an Waymark label", () => {
    expect(publicIdFromScannedText("https://example.com/")).toBeNull();
    expect(publicIdFromScannedText("https://waymark.example/units/abc")).toBeNull();
    expect(publicIdFromScannedText("https://waymark.example/u/short")).toBeNull();
    // I, L, O and U are not in Crockford Base32.
    expect(publicIdFromScannedText("7ZK3QWERTI")).toBeNull();
    expect(publicIdFromScannedText("")).toBeNull();
  });
});
