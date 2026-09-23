import { looksLikeMachineToken } from "@waymark/api-client";

import {
  API_URL_VARIABLE,
  MACHINE_TOKEN_VARIABLE,
  malformedMachineToken,
  noMachineToken,
  unusableApiUrl,
} from "./sentences.js";

export { API_URL_VARIABLE, MACHINE_TOKEN_VARIABLE } from "./sentences.js";

/**
 * Where a locally running API listens, which is what `pnpm --filter
 * @waymark/api dev` serves and what `apps/mobile` already defaults to.
 *
 * A default is right here and wrong for the token: an address is not a secret,
 * getting it wrong fails loudly and immediately, and most people running this
 * against a laptop want exactly this. A DEFAULT credential would be a
 * different kind of thing entirely.
 */
export const DEFAULT_API_URL = "http://127.0.0.1:3000";

export interface Configuration {
  /** Absolute and without a trailing slash; every path is concatenated onto it. */
  readonly baseUrl: string;
  /**
   * The machine token, held in memory and never written anywhere. It is read
   * once, here, and reaches exactly one place: the `Authorization` header the
   * shared client sets.
   */
  readonly token: string;
}

/**
 * Configuration either worked or it did not, and a failure is a SENTENCE
 * rather than a thrown error.
 *
 * A missing token does not stop this server from starting, and that is
 * deliberate. An MCP server that exits at startup is a server the client shows
 * as "failed", with the reason in a log file nobody has open; a server that
 * starts and answers "Waymark has no machine token, create one with ..." puts
 * the fix in front of the person who is at that moment asking which box the
 * soldering iron is in.
 */
export type ConfigurationResult =
  | { readonly ok: true; readonly configuration: Configuration }
  | { readonly ok: false; readonly problem: string };

export const readConfiguration = (
  environment: Readonly<Record<string, string | undefined>>,
): ConfigurationResult => {
  const rawToken = (environment[MACHINE_TOKEN_VARIABLE] ?? "").trim();
  if (rawToken === "") {
    return { ok: false, problem: noMachineToken() };
  }
  if (!looksLikeMachineToken(rawToken)) {
    // Refused here, before a request, because the API would refuse it anyway
    // and "the server said no" is a much worse sentence than "the variable
    // holds something that was never one of these".
    return { ok: false, problem: malformedMachineToken() };
  }

  const baseUrl = normalizeBaseUrl(environment[API_URL_VARIABLE] ?? DEFAULT_API_URL);
  if (baseUrl === null) {
    return { ok: false, problem: unusableApiUrl() };
  }

  return { ok: true, configuration: { baseUrl, token: rawToken } };
};

/**
 * A trailing slash is taken off because `@waymark/api-client` builds every URL
 * as `${baseUrl}${path}` and `${path}` always begins with one. Left alone it
 * produces `https://host//storage-units`, which some servers answer and some
 * do not — a class of bug that only ever shows up in somebody else's
 * deployment.
 */
const normalizeBaseUrl = (raw: string): string | null => {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  return parsed.toString().replace(/\/+$/u, "");
};
