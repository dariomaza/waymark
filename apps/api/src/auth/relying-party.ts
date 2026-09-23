/**
 * # Who a passkey is minted for, and where it may be presented
 *
 * These two values are what stop a passkey minted for another site being
 * accepted here, and a passkey minted here being usable anywhere else. The
 * browser hashes the RP ID into the bytes the authenticator signs, and the
 * verifier checks the origin out of `clientDataJSON` against the expected one,
 * so getting either wrong is not a cosmetic mistake — it is the boundary.
 *
 * ## Why neither of them is a configuration variable
 *
 * Because a second variable is a second thing that can disagree with the
 * first, and this file's whole failure mode is the disagreement. An RP ID set
 * to `idemcloud.uk` while the app is served from `waymark.idemcloud.uk`, or
 * one left at `localhost` in a production compose file, is a deployment that
 * boots perfectly and refuses every fingerprint — at 1am, on a phone, with a
 * browser-side `SecurityError` that names nothing.
 *
 * So both are DERIVED from `WAYMARK_PUBLIC_BASE_URL`, which this API already
 * has, already validates hard, and already points at the document a browser
 * loads this app from. It is the same reasoning `config.ts` makes twice over —
 * for the image processor and for the web root — that two settings which can
 * disagree is one more state than the feature has, and the extra state is
 * always the one that breaks.
 *
 * ADR 16 is what makes this true rather than merely convenient: the API serves
 * the web client from its own origin, so the origin a browser is at IS the
 * public base URL. On a `vite dev` checkout the two are the same by default as
 * well, because that default is the dev server's own address.
 *
 * ## What this cannot check
 *
 * That the base URL names the right host. The server never sees the address
 * bar, so a value that is well formed and points somewhere else is invisible
 * here. What this does instead is make it ONE value rather than three — and
 * that one value is already the URL printed inside every QR code glued to a
 * box, so it is the first thing anybody checks when anything is wrong.
 */

/**
 * What the browser's own prompt says: "Use your passkey for Waymark?".
 *
 * The product is called Waymark in both languages (see `@waymark/i18n`), and
 * this string is rendered by the platform rather than by this app, so it is
 * not a dictionary key.
 */
export const RELYING_PARTY_NAME = "Waymark";

export interface RelyingParty {
  /**
   * A bare domain, no scheme and no port. This is what gets hashed into the
   * signed bytes, and what a credential is permanently bound to: change it and
   * every passkey already registered stops being presentable.
   */
  readonly id: string;
  /** Shown by the platform's own prompt. */
  readonly name: string;
  /** Scheme, host and port, exactly as a browser writes it in `clientDataJSON`. */
  readonly origin: string;
}

/**
 * Loopback, by the two names a browser treats as a secure context.
 *
 * `localhost` and `127.0.0.1` are the exception the specification carves out
 * so that a site can be developed without a certificate. `::1` is in the same
 * paragraph and arrives inside brackets in a URL's hostname, which is why it
 * is spelled that way here.
 */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Why a browser would refuse to run a ceremony against this base URL, or
 * `null` when it would run one.
 *
 * It is a sentence rather than a boolean because the only caller that matters
 * is `loadConfig`, whose whole job is to refuse a misconfiguration by name and
 * say what to change. A boolean would have made the message somebody else's
 * problem, and the message is the point.
 */
export const webAuthnObjectionTo = (publicBaseUrl: string): string | null => {
  let parsed: URL;
  try {
    parsed = new URL(publicBaseUrl);
  } catch {
    return `"${publicBaseUrl}" is not an absolute URL, so there is no host to mint a passkey for`;
  }

  if (parsed.protocol === "https:") {
    return null;
  }

  if (parsed.protocol === "http:" && LOOPBACK_HOSTS.has(parsed.hostname)) {
    return null;
  }

  return (
    `"${publicBaseUrl}" is served over ${parsed.protocol}, and WebAuthn runs only in a ` +
    "secure context: use https, or a loopback host while developing"
  );
};

/**
 * The relying party this deployment is, or a refusal.
 *
 * It throws rather than answering null because there is no caller with
 * anything sensible to do with a relying party that cannot exist. The one
 * place this is built is at startup, and the honest response to a public base
 * URL no browser will honour is to not start — which is exactly what
 * `config.ts` already does for every other value it reads.
 */
export const relyingPartyFor = (publicBaseUrl: string): RelyingParty => {
  const objection = webAuthnObjectionTo(publicBaseUrl);
  if (objection !== null) {
    throw new Error(objection);
  }

  const parsed = new URL(publicBaseUrl);

  return {
    // `hostname`, never `host`: a port is part of an origin and is not part of
    // an RP ID, and a browser refuses an RP ID that carries one.
    id: parsed.hostname,
    name: RELYING_PARTY_NAME,
    // `origin` rather than the string we were handed: it drops a path prefix,
    // normalises a default port away, and is character for character what the
    // browser will write into `clientDataJSON`.
    origin: parsed.origin,
  };
};
