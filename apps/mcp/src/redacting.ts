import { MACHINE_TOKEN_PREFIX } from "@waymark/api-client";

/** What a redacted credential is replaced by: recognisable, and not a secret. */
export const REDACTED = `${MACHINE_TOKEN_PREFIX}[redacted]`;

/**
 * # The second lock on the door
 *
 * Nothing in this package builds a sentence out of the token — `sentences.ts`
 * says why and every one of them is written from the variable's name instead.
 * This runs over everything on its way out anyway.
 *
 * The reason to have both is that the first is a rule and this is a mechanism.
 * A rule holds until somebody adds an error path that interpolates a `Headers`
 * object, or a dependency starts putting the request in an exception's
 * message; and the failure mode of that mistake is a live, long-lived
 * credential written into an assistant's transcript, which is a place it can
 * never be taken out of again. That asymmetry — a string scan per answer
 * against a credential that cannot be un-leaked — is what makes the belt worth
 * having next to the braces.
 *
 * It is a plain substring replacement rather than a pattern for machine
 * tokens generally, because the only secret this process holds is the one it
 * was configured with, and a pattern would also redact the example token in
 * the sentence that tells somebody how to create one.
 */
export const withoutSecret = (text: string, secret: string | null): string => {
  if (secret === null || secret === "") {
    return text;
  }

  return text.split(secret).join(REDACTED);
};
