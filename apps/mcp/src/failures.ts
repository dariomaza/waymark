import { ApiError, ApiErrorCode, OFFLINE_STATUS } from "@waymark/api-client";

import {
  machineTokenRefused,
  nothingThere,
  refusedByTheRequest,
  refusedByTheWorld,
  unexplainedFailure,
  waymarkUnreachable,
  writeRefusedByScope,
} from "./sentences.js";

export interface FailureContext {
  /** Where this server looked, so "unreachable" names an address. */
  readonly baseUrl: string;
  /**
   * What was being attempted, as a verb phrase that completes "could not
   * ___": `search the inventory`, `add "Soldering iron" to Box 3`.
   *
   * Every sentence is built around it, because "it failed" and "it could not
   * move 3 items into Box 3" are the difference between a reader who has to
   * guess what state things are in and one who does not.
   */
  readonly doing: string;
}

/**
 * # One refusal, one sentence, no stack traces
 *
 * `@waymark/api-client` has already done the hard half: it turned whatever
 * came back into an `ApiError` with the API's own `code` and `details`, or
 * into the one transport failure a caller can act on. What is left is to say
 * which of those situations this is, in a sentence whose next move is
 * obvious — and that is a judgement about the READER, which is why it lives
 * here and not in the shared client.
 *
 * The reader is a model with a context budget, answering a person who is
 * standing somewhere holding something. It cannot open a log, it cannot read a
 * status code usefully, and the worst thing this server can hand it is a
 * stack trace, which it will either repeat verbatim or paper over.
 *
 * So every branch answers three questions: what happened, whether anything
 * changed, and what to do about it.
 */
export const sentenceFor = (error: unknown, context: FailureContext): string => {
  if (!(error instanceof ApiError)) {
    // Not the API at all: a bug in this server, or something the runtime threw.
    // Its message is not written for anybody and its stack is written for
    // nobody, so neither is repeated.
    return unexplainedFailure(context.doing);
  }

  if (error.status === OFFLINE_STATUS) {
    return waymarkUnreachable(context.baseUrl);
  }

  if (error.status === 401) {
    return machineTokenRefused();
  }

  if (error.code === ApiErrorCode.READ_ONLY_MACHINE_TOKEN) {
    return writeRefusedByScope(machineTokenNameIn(error), context.doing);
  }

  if (error.status === 404) {
    return nothingThere(context.doing, error.message);
  }

  if (error.status === 409) {
    return refusedByTheWorld(context.doing, error.message);
  }

  if (error.status === 400 || error.status === 422) {
    return refusedByTheRequest(context.doing, error.message);
  }

  return unexplainedFailure(context.doing);
};

/**
 * The API names the token in `details` precisely so an operator reading a log
 * knows which credential to reissue. It is a name a person chose, never a
 * secret — `machineTokenView` cannot carry the hash and the secret was never
 * stored — so repeating it is safe and is the whole point.
 */
const machineTokenNameIn = (error: ApiError): string => {
  const name = error.details["machineTokenName"];

  return typeof name === "string" ? name : "this one";
};
