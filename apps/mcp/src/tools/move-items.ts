import type { ItemAtLocationView } from "@waymark/api-client";
import { itemId, unitId } from "@waymark/domain";

import { counted, detailLine, paragraphs, unitName } from "../render.js";
import { ToolRefusal, type Waymark } from "./answering.js";
import { confirmationFooter, claimRefusal, requireWriteAbility } from "./confirming-tools.js";

export interface MoveItemsArguments {
  readonly itemIds: readonly string[];
  readonly targetStorageUnitId: string;
  readonly confirmation?: string | undefined;
}

interface Movement {
  readonly id: string;
  readonly name: string;
  readonly from: string;
  readonly alreadyThere: boolean;
}

interface MovePlan {
  readonly itemIds: readonly string[];
  readonly targetUnitId: string;
  readonly targetName: string;
  readonly targetLocation: string;
  readonly movements: readonly Movement[];
}

const TOOL = "waymark_move_items";

/**
 * # Moving things, in two calls
 *
 * The same shape as adding, and for the same reasons, with one difference that
 * matters: moving is the operation that can make the inventory LIE. An item
 * added in the wrong place was never anywhere else; an item moved out of the
 * box it is really in leaves somebody opening the wrong box in a garage, which
 * is the exact failure this product exists to prevent.
 *
 * So the preview is about the things rather than about the request: every item
 * by name, with where it is NOW, and the destination by its full path. That is
 * what somebody can look at and say "no, not that one".
 *
 * The move itself is all or nothing (ADR 3) and the API guards it; this passes
 * the whole set in one call rather than looping, so a refusal cannot leave
 * half the things moved.
 */
export const moveItemsToUnit = async (
  waymark: Waymark,
  args: MoveItemsArguments,
): Promise<string> => {
  await requireWriteAbility(waymark, describeIntent(args));
  const fingerprint = fingerprintOf(args);

  if (args.confirmation === undefined) {
    return preview(waymark, args, fingerprint);
  }

  const claim = waymark.confirmations.claim<MovePlan>(args.confirmation, fingerprint);
  if (claim.kind !== "confirmed") {
    throw claimRefusal(claim.kind, TOOL, "moved");
  }

  await waymark.client.moveItems(
    claim.plan.itemIds.map((id) => itemId(id)),
    unitId(claim.plan.targetUnitId),
  );

  return (
    `Moved ${counted(claim.plan.movements.length, "item")} into ` +
    `${claim.plan.targetName} — ${claim.plan.targetLocation}: ` +
    `${claim.plan.movements.map((movement) => movement.name).join(", ")}.`
  );
};

const preview = async (
  waymark: Waymark,
  args: MoveItemsArguments,
  fingerprint: string,
): Promise<string> => {
  const plan = await planOf(waymark, args);
  const code = waymark.confirmations.propose(fingerprint, plan);

  return paragraphs(
    "Nothing has been moved yet. This is what would happen:",
    described(plan),
    confirmationFooter(TOOL, code),
  );
};

/**
 * Resolved out of the one request that answers every item with where it is
 * (ADR 15), rather than one lookup per id.
 *
 * It costs the same whether two things are being moved or twenty, and it is
 * what makes an unknown id a sentence naming that id instead of a 422 from
 * halfway through.
 */
const planOf = async (
  waymark: Waymark,
  args: MoveItemsArguments,
): Promise<MovePlan> => {
  const [inventory, destination] = await Promise.all([
    waymark.client.items(),
    waymark.client.unit(unitId(args.targetStorageUnitId)),
  ]);

  const byId = new Map<string, ItemAtLocationView>(
    inventory.items.map((row) => [row.item.id as string, row]),
  );
  const missing = args.itemIds.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    throw new ToolRefusal(
      `Nothing was moved. Waymark holds no item with ` +
        `${missing.length === 1 ? "the id" : "the ids"} ` +
        `${missing.map((id) => `"${id}"`).join(", ")}. Find the thing with ` +
        `waymark_search and use the id it answers with.`,
    );
  }

  return {
    itemIds: args.itemIds,
    targetUnitId: destination.unit.id,
    targetName: unitName(destination.unit),
    targetLocation: destination.path.map((step) => step.name).join(" > "),
    movements: args.itemIds.map((id) => {
      const row = byId.get(id) as ItemAtLocationView;

      return {
        id,
        name: row.item.name,
        from: row.location,
        alreadyThere: (row.item.storageUnitId as string) === (destination.unit.id as string),
      };
    }),
  };
};

const described = (plan: MovePlan): string =>
  [
    `MOVE ${counted(plan.movements.length, "item")} into ${plan.targetName} — ` +
      plan.targetLocation,
    ...plan.movements.map(
      (movement) =>
        `  ${movement.name} — from ${movement.from}` +
        (movement.alreadyThere ? " (already there; it would not move)" : ""),
    ),
  ].join("\n");

const describeIntent = (args: MoveItemsArguments): string =>
  `move ${counted(args.itemIds.length, "item")} into storage unit ` +
  args.targetStorageUnitId;

/**
 * The ids are sorted, because moving the same things into the same place is
 * the same act whatever order they were named in — and a confirmation that
 * depended on the order would be refusing a request nobody changed.
 */
const fingerprintOf = (args: MoveItemsArguments): string =>
  detailLine(["move", args.targetStorageUnitId, [...args.itemIds].sort().join(",")]);
