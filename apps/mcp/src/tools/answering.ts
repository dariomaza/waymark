import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import type { WriteConfirmations } from "../confirming.js";
import type { WriteAbility } from "../credential.js";
import { sentenceFor } from "../failures.js";
import { withoutSecret } from "../redacting.js";
import type { McpApiClient } from "../waymark.js";

/**
 * Everything a tool needs once this server is usable: a way to reach Waymark,
 * the pending confirmations, and what the credential may do.
 *
 * The confirmations are held here, once per process, because a code minted by
 * one call has to be claimable by the next.
 */
export interface Waymark {
  readonly client: McpApiClient;
  readonly confirmations: WriteConfirmations;
  readonly writeAbility: () => Promise<WriteAbility>;
}

/**
 * A refusal this server made itself, rather than one the API made.
 *
 * A read-only credential and a confirmation that does not match are both
 * "nothing happened, and here is why" — the same shape as an API refusal, so
 * they travel the same way and come out with `isError` set. Thrown rather than
 * returned so that a tool cannot continue past one by forgetting to check.
 */
export class ToolRefusal extends Error {
  constructor(readonly sentence: string) {
    super(sentence);
    this.name = "ToolRefusal";
  }
}

/**
 * What every tool is given: a way to reach Waymark, or the reason there is
 * not one.
 *
 * `waymark` is `null` when this server started without usable configuration.
 * The tools are still registered in that case, deliberately: a client that
 * lists no tools tells an assistant that Waymark is not available, and an
 * assistant that is told that will say so and stop. A tool that answers "there
 * is no machine token, here is how to make one" puts the fix in front of the
 * person who is at that moment asking where something is.
 */
export interface ToolContext {
  readonly waymark: Waymark | null;
  readonly baseUrl: string;
  /** The sentence to answer with while `waymark` is `null`. */
  readonly problem: string | null;
  /** Kept only so it can be scrubbed out of anything on its way to a reader. */
  readonly secret: string | null;
}

/**
 * # One place where a tool's answer is made
 *
 * Every tool goes through here, so three things are decided once.
 *
 * **A failure becomes a sentence.** Nothing this server answers is ever a
 * stack trace, a status code or an exception's message, because the reader can
 * do nothing with any of those. `failures.ts` owns the wording; this owns the
 * fact that no tool can get out of using it.
 *
 * **`doing` is passed in rather than guessed.** It is the phrase that finishes
 * "could not ___", and the tool is the only thing that knows it — "search the
 * inventory", `add "Soldering iron" to Box 3`. It is what makes a refusal say
 * what did not happen instead of that something did not.
 *
 * **The credential is scrubbed on the way out.** Belt and braces: no sentence
 * is built from it in the first place.
 */
export const respond = async (
  context: ToolContext,
  doing: string,
  run: (waymark: Waymark) => Promise<string>,
): Promise<CallToolResult> => {
  if (context.waymark === null) {
    return refusal(context, context.problem ?? "This server is not configured.");
  }

  try {
    return answer(context, await run(context.waymark));
  } catch (error) {
    if (error instanceof ToolRefusal) {
      return refusal(context, error.sentence);
    }

    return refusal(context, sentenceFor(error, { baseUrl: context.baseUrl, doing }));
  }
};

export const answer = (context: ToolContext, text: string): CallToolResult => ({
  content: [{ type: "text", text: withoutSecret(text, context.secret) }],
});

/**
 * `isError` rather than a thrown exception, which is what MCP has it for: the
 * tool ran, the answer is a refusal, and the model is meant to read it and
 * tell the person. A protocol-level error would reach the client as a failed
 * call and the sentence would be the one thing lost.
 */
export const refusal = (context: ToolContext, text: string): CallToolResult => ({
  content: [{ type: "text", text: withoutSecret(text, context.secret) }],
  isError: true,
});
