const AUTHORIZATION = /^(?<scheme>[A-Za-z]+)[ \t]+(?<token>\S+)$/u;

/**
 * The token out of an `Authorization` header, or `null`.
 *
 * `Bearer` and nothing else: accepting another scheme would mean accepting a
 * credential this API never issues. The scheme name is compared case
 * insensitively, because RFC 7235 says it is case insensitive.
 */
export const bearerTokenOf = (
  header: string | string[] | undefined,
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

  const { scheme, token } = matched.groups;

  return scheme?.toLowerCase() === "bearer" ? (token ?? null) : null;
};
