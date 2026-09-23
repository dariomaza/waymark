import type { ItemView, StorageUnitView } from "@waymark/api-client";
import type { SearchMatchField } from "@waymark/domain";

/**
 * # What these tools answer with, and why it is not JSON
 *
 * Everything this server says is read by a model with a context budget, and
 * then by a person who asked where something is. That is one reader with two
 * needs — enough facts to act on, and nothing else — and it decides the shape
 * completely.
 *
 * **A forty-box inventory rendered as JSON is mostly punctuation.** Every row
 * repeats every key, in quotes, with braces and commas around it, and the
 * fields that carry no information repeat too: `"quantity": 1` on the hundred
 * items nobody has two of, `"tags": []`, `"description": null`,
 * `"createdAt"`, `"updatedAt"`, `"photos": []`. A reader pays for all of it
 * and learns nothing from any of it. `render.test.ts` measures the difference
 * against a real forest rather than asserting it.
 *
 * So: **one line per thing, and the line reads as a sentence.**
 *
 * - **The location is the answer**, so it is on the first line of every row,
 *   in full, root first — `Garage > Metal wardrobe > Box 3`. The API already
 *   joins it (ADR 15 and ADR 11 both put it on every row for this reason), so
 *   this is not a computation, it is a decision not to throw it away.
 * - **Ids come last and are labelled**, because a model needs one to make the
 *   next call and a person needs never to see it. Putting it first would make
 *   every row open with eight characters of noise.
 * - **Anything that is only ever the default is left out**: a quantity of one,
 *   an empty tag list, a description nobody wrote. Their absence says the same
 *   thing their presence would, for nothing.
 * - **No `outputSchema`, and no `structuredContent`.** MCP lets a tool declare
 *   one and answer with both, and a client then hands the model the text AND
 *   the JSON — paying twice for one answer. The point of this file is to pay
 *   once.
 */

/** `Box 3 (box)`: the kind in the reader's words rather than the wire's. */
export const unitName = (unit: StorageUnitView): string =>
  `${unit.name} (${unit.kind.toLowerCase()})`;

/** `id: box-3`, labelled, because an unlabelled id is a word nobody can use. */
export const idOf = (id: string): string => `id: ${id}`;

/**
 * The facts about an item that are worth their characters: what there is more
 * than one of, and what somebody deliberately labelled it with.
 *
 * The description is not here. It is prose, it is unbounded, and in a list it
 * would be the longest thing on every row; the tool that answers about ONE
 * item is where it earns its place.
 */
export const itemFacts = (item: ItemView): readonly string[] => {
  const facts: string[] = [];

  if (item.quantity !== 1) {
    facts.push(`x${item.quantity}`);
  }
  if (item.tags.length > 0) {
    facts.push(`tags: ${item.tags.join(", ")}`);
  }

  return facts;
};

/** `x2 · tags: cables, video · id: hdmi`, or just the id. */
export const detailLine = (facts: readonly string[]): string => facts.join(" · ");

/** `matched name and tag` — why this row is in front of the reader. */
export const matchReason = (fields: readonly SearchMatchField[]): string =>
  fields.length === 0
    ? "matched"
    : `matched ${fields.map((field) => field.toLowerCase()).join(" and ")}`;

/** `3 items`, `1 item` — counted, because "some" is not an answer. */
export const counted = (count: number, singular: string, plural = `${singular}s`): string =>
  `${count} ${count === 1 ? singular : plural}`;

/** Paragraphs, with the blank lines between them and none at either end. */
export const paragraphs = (...blocks: readonly (string | null)[]): string =>
  blocks.filter((block): block is string => block !== null && block !== "").join("\n\n");
