import { describe, expect, it } from "vitest";

import { foldSearchText, searchTokensOf, toSearchTerms } from "./search-text.js";

describe("foldSearchText", () => {
  it("lowercases", () => {
    expect(foldSearchText("HDMI")).toBe("hdmi");
  });

  it("strips the accents a Spanish keyboard produces", () => {
    expect(foldSearchText("cámara")).toBe("camara");
    expect(foldSearchText("batería")).toBe("bateria");
    expect(foldSearchText("Tríptico")).toBe("triptico");
  });

  it("folds ñ to n, because half of the searches will be typed without it", () => {
    expect(foldSearchText("Niños")).toBe("ninos");
  });

  it("folds a diaeresis", () => {
    expect(foldSearchText("pingüino")).toBe("pinguino");
  });

  it("leaves text that carries no accent alone", () => {
    expect(foldSearchText("cables de red")).toBe("cables de red");
  });

  it("folds text that is already composed and text that is decomposed the same way", () => {
    const composed = "cámara";
    const decomposed = "cámara";

    expect(composed).not.toBe(decomposed);
    expect(foldSearchText(composed)).toBe(foldSearchText(decomposed));
  });
});

describe("searchTokensOf", () => {
  it("splits on whitespace", () => {
    expect(searchTokensOf("cables de red")).toEqual(["cables", "de", "red"]);
  });

  it("splits on punctuation, so a model number is several tokens", () => {
    expect(searchTokensOf("HDMI 2.1")).toEqual(["hdmi", "2", "1"]);
  });

  it("splits on an underscore, which is punctuation and not a letter", () => {
    expect(searchTokensOf("foto_carnet")).toEqual(["foto", "carnet"]);
  });

  it("drops the empty pieces around leading and trailing separators", () => {
    expect(searchTokensOf("  ¡cámara!  ")).toEqual(["camara"]);
  });

  it("answers nothing for text with no letters or digits in it", () => {
    expect(searchTokensOf("   ")).toEqual([]);
    expect(searchTokensOf("-- ,, --")).toEqual([]);
  });
});

describe("toSearchTerms", () => {
  it("is empty for an empty query", () => {
    expect(toSearchTerms("")).toEqual([]);
    expect(toSearchTerms("   ")).toEqual([]);
  });

  it("folds the query the same way the stored text is folded", () => {
    expect(toSearchTerms("Cámara RÉFLEX")).toEqual(["camara", "reflex"]);
  });

  it("keeps a term only once, so repeating a word does not change the ranking", () => {
    expect(toSearchTerms("cable cable")).toEqual(["cable"]);
  });

  it("keeps the caller's order", () => {
    expect(toSearchTerms("red cables")).toEqual(["red", "cables"]);
  });
});
