/**
 * # One parser for the `Authorization` header, two schemes on top of it
 *
 * RFC 7235 says the header is `<scheme> <credential>` and that the scheme name
 * is case insensitive. That is one grammar, and this API now reads two schemes
 * out of it — `Bearer` for a human's session (ADR 6) and `Machine` for a
 * machine token (ADR 17).
 *
 * They share this function rather than owning a regex each. Two copies of an
 * authorization parser is two things that can drift, and the drift that matters
 * here is the one where a form ONE of them accepts and the other does not
 * quietly opens a way to present a credential under the wrong scheme — which is
 * the single property the scheme split exists to guarantee.
 */
const AUTHORIZATION = /^(?<scheme>[A-Za-z]+)[ \t]+(?<token>\S+)$/u;

/**
 * The credential out of an `Authorization` header when it carries exactly the
 * scheme asked for, or `null`.
 *
 * `null` for every other case, deliberately without saying which: a header that
 * arrived twice, a scheme this API does not issue, a header with no credential
 * behind it. The caller's answer to all of them is the same 401.
 */
export const credentialOf = (
  header: string | string[] | undefined,
  scheme: string,
): string | null => {
  if (typeof header !== "string") {
    // An array means the header arrived twice, which is not a request this API
    // has any reason to guess about.
    return null;
  }

  const matched = AUTHORIZATION.exec(header.trim());
  if (matched?.groups === undefined) {
    return null;
  }

  const { scheme: presented, token } = matched.groups;

  return presented?.toLowerCase() === scheme.toLowerCase()
    ? (token ?? null)
    : null;
};

/**
 * The scheme a presented header claims, lower cased, or `null`.
 *
 * This is what the authenticated scope dispatches on. It reads the scheme ONCE
 * and hands the request to exactly one authenticator, so a stolen session token
 * presented as `Machine` never reaches the session table and a machine token
 * presented as `Bearer` never reaches the machine token table. Trying both in
 * turn would have made a leak of either replayable as the other, which is the
 * whole reason these are two schemes and not one.
 */
export const schemeOf = (
  header: string | string[] | undefined,
): string | null => {
  if (typeof header !== "string") {
    return null;
  }

  const matched = AUTHORIZATION.exec(header.trim());

  return matched?.groups?.["scheme"]?.toLowerCase() ?? null;
};
