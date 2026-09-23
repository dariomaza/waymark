import { credentialOf } from "./authorization-header.js";

/**
 * The token out of an `Authorization` header, or `null`.
 *
 * `Bearer` and nothing else: accepting another scheme would mean accepting a
 * credential this API never issues under it. Since ADR 17 there IS a second
 * credential and a second scheme — `Machine`, in `machine-token-header.ts` —
 * and this function refusing everything but `Bearer` is precisely what stops a
 * machine token being replayed as a session.
 *
 * The grammar itself lives in `authorization-header.ts`, shared with that
 * scheme rather than copied, so the two can never come to disagree about what
 * a well-formed header is. The scheme name is compared case insensitively,
 * because RFC 7235 says it is case insensitive.
 */
export const bearerTokenOf = (
  header: string | string[] | undefined,
): string | null => credentialOf(header, "Bearer");
