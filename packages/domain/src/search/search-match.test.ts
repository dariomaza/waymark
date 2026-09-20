import { describe, expect, it } from "vitest";

import { createItem, type Item } from "../items/item.js";
import { itemId, publicId, unitId } from "../shared/identity.js";
import { createStorageUnit, StorageUnitKind } from "../storage-units/storage-unit.js";
import {
  compareSearchMatches,
  matchItem,
  matchStorageUnit,
  SearchMatchField,
} from "./search-match.js";
import { toSearchTerms } from "./search-text.js";

const NOW = new Date("2026-04-01T10:00:00.000Z");
const BOX = unitId("box");

interface ItemFields {
  readonly name: string;
  readonly description?: string | null;
  readonly tags?: readonly string[];
}

const item = (fields: ItemFields): Item =>
  createItem({
    id: itemId("item"),
    storageUnitId: BOX,
    name: fields.name,
    description: fields.description ?? null,
    tags: fields.tags ?? [],
    now: NOW,
  });

const unit = (name: string) =>
  createStorageUnit({
    id: BOX,
    name,
    kind: StorageUnitKind.BOX,
    publicId: publicId("PUBBOX"),
    now: NOW,
  });

describe("matchItem", () => {
  it("does not match when the query says nothing", () => {
    expect(matchItem(item({ name: "Cables" }), [])).toBeNull();
  });

  it("does not match when a term appears nowhere", () => {
    expect(matchItem(item({ name: "Cables" }), toSearchTerms("taladro"))).toBeNull();
  });

  it("matches on the name", () => {
    const match = matchItem(item({ name: "Cables de red" }), toSearchTerms("cables"));

    expect(match?.matchedFields).toEqual([SearchMatchField.NAME]);
    expect(match?.rankedBy).toBe(SearchMatchField.NAME);
  });

  it("matches on a tag that is nowhere in the name", () => {
    const match = matchItem(
      item({ name: "HDMI 2.1", tags: ["cables", "video"] }),
      toSearchTerms("cables"),
    );

    expect(match?.matchedFields).toEqual([SearchMatchField.TAG]);
    expect(match?.rankedBy).toBe(SearchMatchField.TAG);
  });

  it("matches on the description", () => {
    const match = matchItem(
      item({ name: "Caja azul", description: "Los cables de red viejos" }),
      toSearchTerms("cables"),
    );

    expect(match?.matchedFields).toEqual([SearchMatchField.DESCRIPTION]);
    expect(match?.rankedBy).toBe(SearchMatchField.DESCRIPTION);
  });

  it("matches without accents in either direction", () => {
    expect(matchItem(item({ name: "Cámara réflex" }), toSearchTerms("camara"))).not.toBeNull();
    expect(matchItem(item({ name: "Camara reflex" }), toSearchTerms("cámara"))).not.toBeNull();
    expect(matchItem(item({ name: "Batería de repuesto" }), toSearchTerms("bateria"))).not.toBeNull();
    expect(matchItem(item({ name: "Bateria de repuesto" }), toSearchTerms("batería"))).not.toBeNull();
  });

  it("matches a term that is only the start of a word", () => {
    expect(matchItem(item({ name: "Cables" }), toSearchTerms("cab"))).not.toBeNull();
  });

  it("does not match a term that is longer than the word it starts", () => {
    expect(matchItem(item({ name: "Cab" }), toSearchTerms("cables"))).toBeNull();
  });

  it("lists every field a term was found in, in a canonical order", () => {
    const match = matchItem(
      item({ name: "Cables", description: "cables de red", tags: ["cables"] }),
      toSearchTerms("cables"),
    );

    expect(match?.matchedFields).toEqual([
      SearchMatchField.NAME,
      SearchMatchField.TAG,
      SearchMatchField.DESCRIPTION,
    ]);
  });

  it("needs every term, not just one of them", () => {
    const hdmi = item({ name: "Cable HDMI" });

    expect(matchItem(hdmi, toSearchTerms("cable hdmi"))).not.toBeNull();
    expect(matchItem(hdmi, toSearchTerms("cable usb"))).toBeNull();
  });

  it("accepts terms spread across fields, and then no single field ranks it", () => {
    const match = matchItem(
      item({ name: "Cable HDMI", tags: ["video"] }),
      toSearchTerms("cable video"),
    );

    expect(match?.matchedFields).toEqual([SearchMatchField.NAME, SearchMatchField.TAG]);
    expect(match?.rankedBy).toBeNull();
  });

  it("scores a whole word above a word it merely starts", () => {
    const exact = matchItem(item({ name: "Cable" }), toSearchTerms("cable"));
    const prefix = matchItem(item({ name: "Cablerio" }), toSearchTerms("cable"));

    expect(exact?.relevance).toBeGreaterThan(prefix?.relevance ?? 0);
  });
});

describe("matchStorageUnit", () => {
  it("matches a unit by its name", () => {
    const match = matchStorageUnit(unit("Armario metálico"), toSearchTerms("armario"));

    expect(match?.matchedFields).toEqual([SearchMatchField.NAME]);
    expect(match?.rankedBy).toBe(SearchMatchField.NAME);
  });

  it("matches a unit name without its accent", () => {
    expect(matchStorageUnit(unit("Armario metálico"), toSearchTerms("metalico"))).not.toBeNull();
  });

  it("does not match a unit by anything other than its name", () => {
    expect(matchStorageUnit(unit("Armario"), toSearchTerms("garaje"))).toBeNull();
  });
});

describe("compareSearchMatches", () => {
  const matchOf = (fields: ItemFields, query: string) => {
    const match = matchItem(item(fields), toSearchTerms(query));
    if (match === null) {
      throw new Error(`"${query}" was expected to match`);
    }
    return match;
  };

  it("puts a name match before a description match", () => {
    const name = matchOf({ name: "Cámara réflex" }, "camara");
    const description = matchOf(
      { name: "Trípode", description: "para la cámara" },
      "camara",
    );

    expect(compareSearchMatches(name, description)).toBeLessThan(0);
    expect(compareSearchMatches(description, name)).toBeGreaterThan(0);
  });

  it("puts a tag match before a description match", () => {
    const tag = matchOf({ name: "HDMI 2.1", tags: ["cables"] }, "cables");
    const description = matchOf(
      { name: "Caja", description: "llena de cables" },
      "cables",
    );

    expect(compareSearchMatches(tag, description)).toBeLessThan(0);
  });

  it("puts a name match before a tag match", () => {
    const name = matchOf({ name: "Cables de red" }, "cables");
    const tag = matchOf({ name: "HDMI 2.1", tags: ["cables"] }, "cables");

    expect(compareSearchMatches(name, tag)).toBeLessThan(0);
  });

  it("puts a match spread over several fields behind every single-field match", () => {
    const spread = matchOf(
      { name: "Cable HDMI", description: "para el proyector" },
      "cable proyector",
    );
    const description = matchOf(
      { name: "Caja", description: "cable del proyector" },
      "cable proyector",
    );

    expect(compareSearchMatches(description, spread)).toBeLessThan(0);
  });

  it("puts the better score first inside the same field", () => {
    const exact = matchOf({ name: "Cable" }, "cable");
    const prefix = matchOf({ name: "Cablerio" }, "cable");

    expect(compareSearchMatches(exact, prefix)).toBeLessThan(0);
  });

  it("is zero for two matches of the same quality, so the caller can break the tie", () => {
    const left = matchOf({ name: "Cable" }, "cable");
    const right = matchOf({ name: "Cable" }, "cable");

    expect(compareSearchMatches(left, right)).toBe(0);
  });
});
