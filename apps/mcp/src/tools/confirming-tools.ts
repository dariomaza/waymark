import { CONFIRMATION_LIFETIME_MS } from "../confirming.js";
import { writeImpossibleWithThisToken } from "../sentences.js";
import { ToolRefusal, type Waymark } from "./answering.js";

/**
 * The two things both write tools do the same way, so that they cannot drift
 * apart: refuse a credential that may not write, and explain a confirmation
 * that did not work.
 */

/**
 * Refuses before anything is resolved, previewed or sent.
 *
 * Asked first rather than last because the alternative is a preview that says
 * "here is what would happen" to a caller for whom nothing would happen, and
 * then a 403 after a confirmation. That would be this server inviting somebody
 * to agree to something it already knew it could not do.
 */
export const requireWriteAbility = async (
  waymark: Waymark,
  doing: string,
): Promise<string> => {
  const ability = await waymark.writeAbility();

  if (!ability.allowed) {
    throw new ToolRefusal(writeImpossibleWithThisToken(ability.tokenName, doing));
  }

  return ability.tokenName;
};

const MINUTES = CONFIRMATION_LIFETIME_MS / 60_000;

/**
 * How the preview ends, and the only place a code is ever handed out.
 *
 * It says the three things that make the code a confirmation rather than a
 * password: it belongs to this exact plan, it works once, and it lapses. It
 * also says the thing this server cannot enforce and can only ask for — that a
 * person should have seen the description above before it is used. The
 * enforcement of THAT is a read-only token (ADR 17), not a sentence.
 */
export const confirmationFooter = (tool: string, code: string): string =>
  `Show the description above to the person and go ahead only if they agree ` +
  `to it. To do it, call ${tool} again with exactly the same arguments plus ` +
  `confirmation: "${code}". That code was issued for this exact change, it ` +
  `works once, and it lapses after ${MINUTES} minutes. It cannot be guessed ` +
  `or worked out — if you do not have one, call ${tool} without a ` +
  `confirmation and read what comes back.`;

/**
 * A claim that did not confirm anything, said in the two ways it can fail.
 *
 * They are kept apart because the fixes are different: a code that is not
 * recognised means start again with a preview, and a code that does not match
 * means the arguments changed after the person agreed to them — which is the
 * more interesting of the two, and exactly the thing the binding exists to
 * catch.
 */
export const claimRefusal = (
  kind: "unknown" | "mismatched",
  tool: string,
  pastTense: string,
): ToolRefusal =>
  new ToolRefusal(
    kind === "mismatched"
      ? `Nothing was ${pastTense}. That confirmation was issued for a ` +
        `different change than the one now being asked for, so it was not ` +
        `accepted — a confirmation belongs to the exact change it was shown ` +
        `for. Call ${tool} without a confirmation to describe what you mean ` +
        `now, and confirm that.`
      : `Nothing was ${pastTense}. That is not a confirmation this server ` +
        `issued: it was never valid, it has already been used, or it has ` +
        `lapsed. A confirmation cannot be invented — call ${tool} without ` +
        `one, read what it says would happen, show that to the person, and ` +
        `use the code it gives you.`,
  );
