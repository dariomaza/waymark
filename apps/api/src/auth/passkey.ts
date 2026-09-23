/**
 * # A device somebody can prove they are holding
 *
 * A passkey is a public key an authenticator generated for this site and will
 * sign a challenge with, once it has checked that the person in front of it is
 * the person it was set up for. It is a way of proving who you are, and it
 * opens exactly the session a password opens (ADR 6): there is no second kind
 * of session and nothing downstream can tell which door somebody came through.
 *
 * ## Why this is not a `User` and not a `Session`
 *
 * It is neither a person nor a grant. It is a CREDENTIAL — the third one in
 * this codebase, beside a password hash and a machine token — and it lives in
 * `@waymark/api` beside them for the reason `user.ts` gives: who is allowed in
 * is not a statement about boxes. `packages/domain` gains nothing from this
 * file, exactly as it gained nothing from ADR 17.
 *
 * ## Why it HAS a `userId`, where a machine token does not
 *
 * `machine-token.ts` argues at length that provenance nothing reads is a
 * column that goes stale, and that a machine token is a credential against the
 * shared inventory rather than a delegation of one person's access. Both of
 * those are true of a machine and false of a thumb.
 *
 * A passkey is a proof of one particular PERSON — it answers "this is Darío",
 * which is the only question it is asked, so the answer has to be stored. And
 * the field is read on the single hottest path this credential has: an
 * assertion arrives carrying a credential id and nothing else (there is no
 * username in a discoverable-credential sign-in), and the row is what says
 * whose session to open.
 *
 * ## What is NOT on this row, and why
 *
 * The public key is not a secret and does not need to be hashed — hashing it
 * would make it useless, since verification needs the key itself. What IS
 * sensitive is the shape of the list: which devices somebody owns, how many,
 * and whether they carry a security key. So the row holds what verifying a
 * signature needs and stops there.
 *
 * - No attestation and no AAGUID. `attestationType: "none"` means the
 *   authenticator is never asked to prove its make and model, and there would
 *   be nothing to do with the answer: this product has no authenticator
 *   allowlist and will not grow one.
 * - No `credentialDeviceType` and no `credentialBackedUp`. Whether somebody's
 *   passkey is synced to their cloud account is a fact about their life, and
 *   an inventory in a garage has no policy to apply it to.
 */
export interface Passkey {
  readonly id: string;
  /** Whose thumb this is. The only question an assertion answers. */
  readonly userId: string;
  /**
   * base64url, as the browser sends it and as the library wants it back.
   *
   * Unique across everybody, because it is what an assertion is looked up by
   * and a sign-in carries no username to disambiguate with. The index decides
   * equality, so no credential id is ever compared byte by byte here — the
   * same property `MachineTokenRepository` makes for a token hash.
   */
  readonly credentialId: string;
  /** base64url of the COSE public key. Not a secret, and not hashed. */
  readonly publicKey: string;
  /**
   * What the authenticator said its signature counter was.
   *
   * Zero for most of them, for ever. See `signalsAClonedAuthenticator`.
   */
  readonly signCount: number;
  /**
   * `internal`, `hybrid`, `usb`, `nfc`, `ble` — how the browser reaches this
   * authenticator. A hint the platform uses to draw the right prompt, kept
   * because it describes the connection rather than the person. May be empty:
   * not every browser reports it.
   */
  readonly transports: readonly string[];
  /**
   * What the person called the device: "Pixel 8", "Work laptop".
   *
   * It is how somebody decides which one to remove, months later, which is
   * the only decision this list exists to support.
   */
  readonly label: string;
  readonly createdAt: Date;
  /**
   * `null` until it has opened a session.
   *
   * Stamped on EVERY sign-in, unlike a machine token's, which is throttled to
   * once an hour. The throttle exists because a machine reads in a loop; a
   * person signs in a handful of times a week, so there is no write to save
   * and the field can simply be true.
   */
  readonly lastUsedAt: Date | null;
}

/**
 * Long enough for "Pixel 8 de Darío", short enough that a row on a phone does
 * not wrap three times. A label is read in a list, and a list is the whole
 * point of naming them.
 */
export const PASSKEY_LABEL_MAX_LENGTH = 60;

/**
 * Trimmed, and nothing else.
 *
 * Deliberately NOT lower-cased, where a username and a machine token name both
 * are. Those two are typed into a shell to address a row and must never be
 * ambiguous; this is a name a person reads in a list, addressed by an id they
 * never see, so lower-casing "Pixel 8" would be taking something away for a
 * property nothing needs.
 */
export const normalizePasskeyLabel = (raw: string): string => raw.trim();

/**
 * Any characters at all, as long as there are some and not too many.
 *
 * `create-machine-token.ts` refuses accents and anything outside ASCII, and it
 * is right to: that name goes into a shell argument, where `café` and `cafe`
 * look identical in half the terminals in the world. This one goes into a
 * `<li>`, so the opposite is true — refusing "Móvil de Darío" would be a rule
 * with no reason behind it in a product that ships in Spanish.
 */
export const isUsablePasskeyLabel = (raw: string): boolean => {
  const label = normalizePasskeyLabel(raw);

  return label.length > 0 && label.length <= PASSKEY_LABEL_MAX_LENGTH;
};

/**
 * # Whether a presented counter means two things are answering for one key
 *
 * A genuine authenticator only ever counts up, so a signature carrying a count
 * at or below one already seen is evidence that the credential exists in two
 * places. That is the whole reason the counter is in the protocol.
 *
 * The complication, and the reason this is a named function with a test rather
 * than a `<=` somewhere: **most authenticators this product will meet always
 * send zero.** A passkey synced across a phone, a tablet and a laptop cannot
 * have one honest counter, so platform authenticators and password managers do
 * not keep one. Treating zero as a regression would refuse every one of them
 * on its second use.
 *
 * So zero-against-zero is "this authenticator does not count", and everything
 * else is read literally — including a zero from a credential that has counted
 * before, which is not an authenticator that stopped implementing counters but
 * something else answering in its place.
 *
 * What the caller does with a `true` is refuse the sign-in and leave the row
 * alone. It does NOT delete the passkey: this signal can be produced by a
 * buggy authenticator, the person may be standing in a garage at the time, and
 * the password form is still on the screen either way (ADR 19).
 */
export const signalsAClonedAuthenticator = (
  stored: number,
  presented: number,
): boolean => {
  if (stored === 0 && presented === 0) {
    return false;
  }

  return presented <= stored;
};
