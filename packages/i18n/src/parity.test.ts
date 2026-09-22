import { describe, expect, it } from "vitest";

import { EN } from "./en.js";
import { ES } from "./es.js";

/**
 * # The two dictionaries have to say the same SHAPE, not just the same keys
 *
 * A missing key is a build failure: `Dictionary` is derived from the English
 * object, so TypeScript refuses a Spanish one that is short a line.
 *
 * A missing PLACEHOLDER is not. `"Sesión iniciada"` where English says
 * `"Signed in as {username}"` compiles perfectly, and the type system has no
 * opinion about the inside of a string literal. What comes out is a sentence
 * that quietly drops the one piece of information it existed to carry, in one
 * language only, on somebody else's phone.
 *
 * It is the classic translation bug precisely because nothing shouts. There
 * is a test for each phrase that takes a value, but those cover the keys
 * somebody thought to cover; this covers all of them, including the ones
 * added next year.
 */
const placeholdersOf = (value: unknown): ReadonlySet<string> => {
  const found = new Set<string>();

  const walk = (node: unknown): void => {
    if (typeof node === "string") {
      for (const [, name] of node.matchAll(/\{(\w+)\}/gu)) {
        if (name !== undefined) {
          found.add(name);
        }
      }

      return;
    }

    if (typeof node === "object" && node !== null) {
      for (const child of Object.values(node)) {
        walk(child);
      }
    }
  };

  walk(value);

  return found;
};

const sorted = (values: ReadonlySet<string>): string[] => [...values].sort();

describe("the two dictionaries", () => {
  it("has at least one phrase that takes a value, or this test proves nothing", () => {
    const counted = Object.values(EN).filter((phrase) => placeholdersOf(phrase).size > 0);

    expect(counted.length).toBeGreaterThan(0);
  });

  it.each(Object.keys(EN))("carries the same placeholders in %s", (key) => {
    const english = EN[key as keyof typeof EN];
    const spanish = ES[key as keyof typeof ES];

    expect(sorted(placeholdersOf(spanish))).toEqual(sorted(placeholdersOf(english)));
  });
});
