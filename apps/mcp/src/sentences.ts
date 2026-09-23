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

/**
 * The request never left this process, so nothing happened at the other end
 * and there is nothing to undo. Two things cause it and the sentence names
 * both, because the address being wrong and the server being off look
 * identical from here.
 */
export const waymarkUnreachable = (baseUrl: string): string =>
  `Waymark could not be reached at ${baseUrl}, so nothing was read and ` +
  `nothing was changed. Either the API is not running or ${API_URL_VARIABLE} ` +
  `points somewhere else.`;

/**
 * The token got there and was refused. Deliberately distinct from "there is no
 * token": the fix is to issue a new one, not to set a variable that is empty.
 */
export const machineTokenRefused = (): string =>
  `Waymark refused this machine token. It is unknown, has been revoked, or ` +
  `has expired — the API does not say which, on purpose. Issue a new one on ` +
  `the Waymark server with ${CREATE_COMMAND} and put it in ` +
  `${MACHINE_TOKEN_VARIABLE}.`;

/**
 * The credential is good and the request was fine; the key is just smaller
 * than the job (ADR 17). Nothing reached a use case — the API refuses a
 * read-only write in the hook that authenticated it, before the body is even
 * parsed — so the promise that nothing changed is the API's, not a guess.
 */
export const writeRefusedByScope = (tokenName: string, doing: string): string =>
  `Waymark refused to ${doing}: the machine token "${tokenName}" is read-only, ` +
  `so it may read the inventory but may not change it. Nothing was changed. ` +
  `To allow this, issue a read-write token on the Waymark server — ` +
  `pnpm --filter @waymark/api machine-token create --name ${tokenName}-rw ` +
  `--scope read-write — and put it in ${MACHINE_TOKEN_VARIABLE}.`;

/**
 * The same refusal, made before a request rather than by one.
 *
 * A write tool knows its own scope from `GET /auth/me`, so it can say this
 * without asking the API to say no. The wording matches the sentence above
 * because it is the same fact; what differs is that this one costs no round
 * trip and cannot have touched anything at all.
 */
export const writeImpossibleWithThisToken = (
  tokenName: string,
  doing: string,
): string =>
  `This server cannot ${doing}: the machine token "${tokenName}" it was given ` +
  `is read-only, so Waymark would refuse the write. Nothing was changed, and ` +
  `no request was made. To allow this, issue a read-write token on the ` +
  `Waymark server — pnpm --filter @waymark/api machine-token create --name ` +
  `${tokenName}-rw --scope read-write — and put it in ${MACHINE_TOKEN_VARIABLE}.`;

/** The URL pointed at something that is not there. */
export const nothingThere = (doing: string, detail: string): string =>
  `Waymark could not ${doing} because it does not hold what the request ` +
  `named: ${detail}. Nothing was changed. Look it up with a search first, and ` +
  `use the id that comes back.`;

/** ADR 8's 409: correct request, correct credential, wrong state of the world. */
export const refusedByTheWorld = (doing: string, detail: string): string =>
  `Waymark refused to ${doing} because of the state of the inventory: ` +
  `${detail}. Nothing was changed. The same request works once that is dealt ` +
  `with.`;

/** ADR 8's 422 and its 400: the request itself is what has to change. */
export const refusedByTheRequest = (doing: string, detail: string): string =>
  `Waymark refused to ${doing} because the request was wrong: ${detail}. ` +
  `Nothing was changed, and repeating it unchanged will fail identically.`;

/** Anything else the API said, and anything that was never the API at all. */
export const unexplainedFailure = (doing: string): string =>
  `This server could not ${doing}: Waymark answered in a way it could not ` +
  `make sense of. Nothing was changed. If it keeps happening, the API's own ` +
  `log is where the reason is.`;

export const unusableApiUrl = (): string =>
  `${API_URL_VARIABLE} is not an http or https address, so this server does ` +
  `not know where Waymark is. Set it to the address the API answers on, such ` +
  `as https://waymark.example, or leave it unset to use the local default.`;
