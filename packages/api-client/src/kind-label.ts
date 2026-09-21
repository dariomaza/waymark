import { StorageUnitKind } from "@ariadna/domain";

/**
 * A kind is a presentational hint and nothing more: nesting is never
 * constrained by it (ADR 1), so this is a label and not a rule.
 */
const LABELS: Readonly<Record<StorageUnitKind, string>> = {
  [StorageUnitKind.ROOM]: "Room",
  [StorageUnitKind.FURNITURE]: "Furniture",
  [StorageUnitKind.SHELF]: "Shelf",
  [StorageUnitKind.DRAWER]: "Drawer",
  [StorageUnitKind.BOX]: "Box",
  [StorageUnitKind.BAG]: "Bag",
  [StorageUnitKind.OTHER]: "Other",
};

export const kindLabel = (kind: StorageUnitKind): string => LABELS[kind] ?? "Other";

/** Every kind, in the order the form offers them: big things first. */
export const KIND_CHOICES: readonly { readonly kind: StorageUnitKind; readonly label: string }[] =
  Object.values(StorageUnitKind).map((kind) => ({ kind, label: LABELS[kind] }));
