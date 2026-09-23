import type { CreateItemInput, StorageUnitDetailResponse } from "@waymark/api-client";
import { unitId } from "@waymark/domain";

import { detailLine, paragraphs, unitName } from "../render.js";
import { confirmationFooter, claimRefusal, requireWriteAbility } from "./confirming-tools.js";
import type { Waymark } from "./answering.js";

export interface AddItemArguments {
  readonly storageUnitId: string;
  readonly name: string;
  readonly description?: string | undefined;
  readonly quantity?: number | undefined;
  readonly tags?: readonly string[] | undefined;
  /**
   * The code a previous call to this tool answered with. Absent on the first
   * call, which is what makes that call a preview rather than a write.
   */
  readonly confirmation?: string | undefined;
}

interface AddPlan {
  readonly input: CreateItemInput;
  readonly itemName: string;
  readonly unitName: string;
  readonly unitLocation: string;
}

const TOOL = "waymark_add_item";

/**
 * # Putting something away, in two calls
 *
 * The first call writes nothing. It resolves the destination — which is a real
 * request, so a unit that does not exist is found out here rather than halfway
 * through — describes the addition in a name and a place rather than in ids,
 * and answers with a code.
 *
 * The second call, carrying that code, does it. `confirming.ts` argues why the
 * code is what it is; the short version is that `confirm: true` is a value a
 * model produces by pattern-matching, and this is a value it can only have
 * been given.
 */
export const addItemToUnit = async (
  waymark: Waymark,
  args: AddItemArguments,
): Promise<string> => {
  const tokenName = await requireWriteAbility(
    waymark,
    `add "${args.name}" to the inventory`,
  );
  const fingerprint = fingerprintOf(args);

  if (args.confirmation === undefined) {
    return preview(waymark, args, fingerprint);
  }

  const claim = waymark.confirmations.claim<AddPlan>(args.confirmation, fingerprint);
  if (claim.kind !== "confirmed") {
    throw claimRefusal(claim.kind, TOOL, "added");
  }

  await waymark.client.createItem(claim.plan.input);

  return (
    `Added "${claim.plan.itemName}" to ${claim.plan.unitName} — ` +
    `${claim.plan.unitLocation}. It was put there by the machine token ` +
    `"${tokenName}".`
  );
};

const preview = async (
  waymark: Waymark,
  args: AddItemArguments,
  fingerprint: string,
): Promise<string> => {
  const destination = await waymark.client.unit(unitId(args.storageUnitId));
  const plan = planOf(args, destination);
  const code = waymark.confirmations.propose(fingerprint, plan);

  return paragraphs(
    "Nothing has been added yet. This is what would happen:",
    described(plan),
    confirmationFooter(TOOL, code),
  );
};

const planOf = (
  args: AddItemArguments,
  destination: StorageUnitDetailResponse,
): AddPlan => ({
  input: {
    storageUnitId: destination.unit.id,
    name: args.name,
    description: args.description ?? null,
    quantity: args.quantity ?? 1,
    tags: args.tags ?? [],
  },
  itemName: args.name,
  unitName: unitName(destination.unit),
  unitLocation: destination.path.map((step) => step.name).join(" > "),
});

/**
 * The description a person checks. Names and a place, in that order, with the
 * id nowhere in it: an id is not something anybody can look at and say "no,
 * not that box".
 */
const described = (plan: AddPlan): string =>
  [
    `ADD one item to Waymark`,
    `  Item: ${plan.itemName}`,
    ...(plan.input.quantity === 1 ? [] : [`  Quantity: ${plan.input.quantity}`]),
    ...(plan.input.tags.length === 0
      ? []
      : [`  Tags: ${plan.input.tags.join(", ")}`]),
    ...(plan.input.description === null
      ? []
      : [`  Description: ${plan.input.description}`]),
    `  Into: ${plan.unitName} — ${plan.unitLocation}`,
  ].join("\n");

/**
 * What the confirmation is bound to: every argument that decides what would be
 * written, and nothing that does not.
 *
 * It is built from the ARGUMENTS rather than from the resolved world on
 * purpose. The code confirms the request a person was shown and agreed to; if
 * somebody renames the box in between, that is not a different request.
 */
const fingerprintOf = (args: AddItemArguments): string =>
  detailLine([
    "add",
    args.storageUnitId,
    args.name,
    String(args.quantity ?? 1),
    (args.tags ?? []).join(","),
    args.description ?? "",
  ]);
