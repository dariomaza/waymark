import type { ItemView, StorageUnitDetailResponse, StorageUnitView } from "@waymark/api-client";
import { unitId } from "@waymark/domain";

import { counted, detailLine, idOf, itemFacts, paragraphs, unitName } from "../render.js";
import type { McpApiClient } from "../waymark.js";

export interface UnitArguments {
  readonly storageUnitId: string;
}

/**
 * # What is in this box
 *
 * The second question anybody asks, and the one a person standing in front of
 * an open box asks first. It is one request because the API answers it as one
 * screen: the unit, its breadcrumb, what it holds, and what is inside what it
 * holds.
 *
 * This is the only read that spends characters on a description. In a list of
 * forty boxes a description is prose on every row and the longest thing on it;
 * about ONE unit it is the sentence somebody wrote to remind themselves what
 * they put in there, which is exactly the thing worth having.
 */
export const inspectStorageUnit = async (
  client: McpApiClient,
  args: UnitArguments,
): Promise<string> => {
  const detail = await client.unit(unitId(args.storageUnitId));

  return paragraphs(
    heading(detail),
    detail.unit.description,
    contents(detail.children, detail.items),
  );
};

const heading = (detail: StorageUnitDetailResponse): string =>
  [
    `${unitName(detail.unit)} — ${detail.path.map((step) => step.name).join(" > ")}`,
    // The label code is here and nowhere else: it is what is printed under the
    // QR on the sticker, and the reason to read it out is that the symbol
    // itself has been scuffed past what the camera can recover.
    detailLine([idOf(detail.unit.id), `label code: ${detail.unit.publicId}`]),
  ].join("\n");

const contents = (
  children: readonly StorageUnitView[],
  items: readonly ItemView[],
): string => {
  if (children.length === 0 && items.length === 0) {
    return "It is empty: no storage units inside it and no items in it.";
  }

  return paragraphs(
    children.length === 0
      ? null
      : [
          `Holds ${counted(children.length, "storage unit")}:`,
          ...children.map((child) => `  ${unitName(child)} — ${idOf(child.id)}`),
        ].join("\n"),
    items.length === 0
      ? null
      : [
          `Holds ${counted(items.length, "item")}:`,
          ...items.map(
            (item) => `  ${item.name} — ${detailLine([...itemFacts(item), idOf(item.id)])}`,
          ),
        ].join("\n"),
  );
};
