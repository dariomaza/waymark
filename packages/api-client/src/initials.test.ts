import { describe, expect, it } from "vitest";

import { initialsOf } from "./initials.js";

describe("the initials a thing falls back to", () => {
  it("takes the first letter of the first two words", () => {
    expect(initialsOf("Cinta aislante")).toBe("CA");
  });

  it("stops at two, however many words there are", () => {
    expect(initialsOf("Caja de tornillos variados")).toBe("CD");
  });

  it("gives one letter to a one-word name, not a padded one", () => {
    expect(initialsOf("Taladro")).toBe("T");
  });

  /**
   * A Spanish inventory is full of these, and a letter that comes back
   * stripped of its accent is a different letter to the person reading it.
   */
  it("keeps an accent, because Á is not A to whoever wrote it", () => {
    expect(initialsOf("Álbumes de fotos")).toBe("ÁD");
  });

  it("uppercases whatever it was given", () => {
    expect(initialsOf("caja pequeña")).toBe("CP");
  });

  /**
   * The name is free text somebody typed one-handed in a garage. Every one of
   * these is a real thing to type, and none of them may produce a crash or a
   * box with a stray symbol in it.
   */
  it("ignores the punctuation people put between words", () => {
    expect(initialsOf("  taladro   —  bosch ")).toBe("TB");
    expect(initialsOf("(varios) cables")).toBe("VC");
  });

  it("answers nothing for a name with no letters in it", () => {
    expect(initialsOf("")).toBe("");
    expect(initialsOf("   ")).toBe("");
    expect(initialsOf("—")).toBe("");
  });

  /**
   * An emoji is one character to a person and two to JavaScript. Splitting it
   * down the middle puts half a symbol on screen, which is the kind of thing
   * that only ever shows up in somebody's real data.
   */
  it("does not cut a character in half", () => {
    expect(initialsOf("🔧 llave")).toBe("🔧L");
  });
});
