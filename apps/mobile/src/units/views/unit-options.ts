import type { FlatUnit } from "@waymark/api-client";

import type { Option } from "../../ui/atoms/option-list.js";

/**
 * Every unit in the house, as options, labelled by where each one is.
 *
 * The label is the full path and not the name: a house has three boxes
 * called `Box 3`, and a picker that shows only names is a coin toss.
 *
 * Nothing is filtered out — not the unit being moved, not its own children.
 * Whether a move is legal is the domain's decision (ADR 2), and a client that
 * pre-empts it is a second, quieter copy of a rule that already exists.
 */
export const unitOptions = (units: readonly FlatUnit[]): readonly Option[] =>
  units.map((entry) => ({ value: entry.unit.id, label: entry.location }));
