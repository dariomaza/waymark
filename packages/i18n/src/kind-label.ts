import { StorageUnitKind } from "@waymark/domain";

import type { MessageKey } from "./dictionary.js";
import type { Translate } from "./translate.js";

/**
 * A kind is a presentational hint and nothing more: nesting is never
 * constrained by it (ADR 1), so this is a label and not a rule.
 *
 * The domain's `StorageUnitKind` stays exactly as it was — `ROOM`, `BOX`,
 * `DRAWER` are the vocabulary two machines agree on and must not move. What
 * moves is the WORD each one is drawn as, which is the one part a person
 * reads.
 */

/**
 * Narrowed to the kind keys rather than left as any `MessageKey`, because a
 * translator call has to know at compile time whether the phrase it is about
 * to say needs values handed to it. Every one of these is a bare word with no
 * holes, and saying so here is what lets `t(KEYS[kind])` take no second
 * argument.
 */
type KindKey = Extract<MessageKey, `units.kind.${string}`>;

const KEYS: Readonly<Record<StorageUnitKind, KindKey>> = {
  [StorageUnitKind.ROOM]: "units.kind.room",
  [StorageUnitKind.FURNITURE]: "units.kind.furniture",
  [StorageUnitKind.SHELF]: "units.kind.shelf",
  [StorageUnitKind.DRAWER]: "units.kind.drawer",
  [StorageUnitKind.BOX]: "units.kind.box",
  [StorageUnitKind.BAG]: "units.kind.bag",
  [StorageUnitKind.OTHER]: "units.kind.other",
};

export const kindLabel = (t: Translate, kind: StorageUnitKind): string =>
  t(KEYS[kind] ?? "units.kind.other");

/**
 * Every kind, in the order the form offers them: big things first.
 *
 * A function rather than the constant it used to be, because the labels are
 * no longer knowable at module load: they depend on which language is on
 * screen, and a list built once at import time would be built in whichever
 * language happened to be first.
 */
export const kindChoices = (
  t: Translate,
): readonly { readonly kind: StorageUnitKind; readonly label: string }[] =>
  Object.values(StorageUnitKind).map((kind) => ({ kind, label: kindLabel(t, kind) }));
