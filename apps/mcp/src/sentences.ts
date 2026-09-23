/**
 * # The words this server answers with
 *
 * Everything an assistant reads out of this server is written here, in one
 * file, for two reasons.
 *
 * **A failure has to be actionable.** "No token", "the wrong token", "the API
 * is not answering" and "this credential may not write" are four different
 * situations with four different things to do about them, and collapsing them
 * into one apology — or worse, into a stack trace — puts the person holding
 * the laptop in the wrong layer for an hour. Each sentence here names what
 * happened, says whether anything changed, and gives the next move.
 *
 * **The token must never appear in one.** Every sentence about a credential is
 * written from the VARIABLE'S NAME and never from its value. A sentence built
 * by interpolating what the caller presented is one `${}` away from putting a
 * live credential in an assistant's transcript, and `redacting.ts` is the
 * second lock on that door rather than the first.
 *
 * They are in English and they are not in `@waymark/i18n`. That package holds
 * copy a PERSON reads in a UI, in their own language; these are read by a
 * model, they carry shell commands and variable names that are English
 * whatever the reader speaks, and translating them would make the model's
 * instructions vary by locale.
 */
import { MACHINE_TOKEN_PREFIX } from "@waymark/api-client";

export const API_URL_VARIABLE = "WAYMARK_API_URL";
export const MACHINE_TOKEN_VARIABLE = "WAYMARK_MACHINE_TOKEN";

/** What a token is created with, quoted verbatim so it can be pasted. */
const CREATE_COMMAND =
  "pnpm --filter @waymark/api machine-token create --name mcp-server --scope read";

export const noMachineToken = (): string =>
  `Waymark has no machine token, so nothing was read and nothing was changed. ` +
  `Set ${MACHINE_TOKEN_VARIABLE} in this MCP server's environment to a token ` +
  `created on the Waymark server with: ${CREATE_COMMAND}`;

export const malformedMachineToken = (): string =>
  `${MACHINE_TOKEN_VARIABLE} is set to something that was never a Waymark ` +
  `machine token, so no request was made. A machine token begins with ` +
  `"${MACHINE_TOKEN_PREFIX}"; a user's session token is not one and cannot be ` +
  `used here. Check what the variable is set to.`;

export const unusableApiUrl = (): string =>
  `${API_URL_VARIABLE} is not an http or https address, so this server does ` +
  `not know where Waymark is. Set it to the address the API answers on, such ` +
  `as https://waymark.example, or leave it unset to use the local default.`;
