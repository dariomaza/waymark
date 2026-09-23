import type { PasskeyCeremonyOptions, PasskeyCredential } from "@waymark/api-client";
import {
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";

/**
 * # The browser's half of a ceremony, behind one small port
 *
 * Everything that only a real browser can do lives here: asking whether this
 * device has an authenticator at all, and putting the prompt on the screen.
 * Nothing above this line touches `navigator.credentials`, which is what lets
 * the screens be tested in jsdom — where none of it exists.
 *
 * It is a port with a real implementation beside it, in the shape this app
 * already uses for the camera (`scanning/qr-scanner.ts`): the thing the
 * platform owns is injected, and the component is the same component either
 * way.
 *
 * ## Why the ceremony is not written here
 *
 * `@simplewebauthn/browser` does two things worth having. It turns the JSON
 * the API sends into the `ArrayBuffer`s `navigator.credentials` insists on and
 * back again — base64url in six places, each of which is silently wrong rather
 * than loudly wrong — and it turns a browser's `DOMException` into an error
 * that says which of the eight documented failures happened. The second one is
 * why the cancel case below can be recognised at all.
 *
 * Its API changed across majors: `startRegistration` and `startAuthentication`
 * take ONE options object (`{ optionsJSON }`) since v10, which is not the
 * shape most of the internet shows. Version 14 is what this is written
 * against.
 */

export interface PasskeyPlatform {
  /**
   * Whether this device can actually serve a passkey.
   *
   * Both halves matter. `browserSupportsWebAuthn` is about the API existing;
   * `platformAuthenticatorIsAvailable` is about there being a fingerprint
   * reader, a face camera or a screen lock behind it. A browser with the API
   * and no authenticator would show a button that opens a dialog with nothing
   * in it, which is worse than no button.
   */
  isAvailable(): Promise<boolean>;
  register(options: PasskeyCeremonyOptions): Promise<PasskeyCredential>;
  assert(options: PasskeyCeremonyOptions): Promise<PasskeyCredential>;
}

/**
 * Somebody closed the prompt, or let it time out, or the device said no
 * without saying why.
 *
 * It is a class of its own because it is not a failure: nothing was refused
 * and nothing is wrong. The screen says so quietly and leaves the password
 * form exactly where it was — ADR 19's rule, at the one moment it is easiest
 * to get wrong, because an error callout here would tell somebody their
 * fingerprint is broken when all they did was change their mind.
 */
export class PasskeyCancelled extends Error {
  constructor() {
    super("The passkey prompt was dismissed");
    this.name = "PasskeyCancelled";
  }
}

/** Recognised by the library, which is why it is worth its bytes. */
const WAS_DISMISSED = "ERROR_CEREMONY_ABORTED";

const cancelledIfDismissed = (cause: unknown): never => {
  if (
    cause instanceof Error &&
    ((cause as { code?: string }).code === WAS_DISMISSED ||
      // A browser the library does not recognise still raises the standard
      // `NotAllowedError`, which is what a dismissed prompt has always been.
      cause.name === "NotAllowedError" ||
      cause.name === "AbortError")
  ) {
    throw new PasskeyCancelled();
  }

  throw cause;
};

export const browserPasskeyPlatform: PasskeyPlatform = {
  async isAvailable() {
    if (!browserSupportsWebAuthn()) {
      return false;
    }

    try {
      return await platformAuthenticatorIsAvailable();
    } catch {
      // A browser that refuses to answer the question is a browser that should
      // not be offered the button. The password form is right there.
      return false;
    }
  },

  async register(options) {
    try {
      return (await startRegistration({
        // The options are whatever the API sent, passed through: this app has
        // no opinion about a specification it does not implement, and picking
        // fields out would drop whatever a browser learns to want next.
        optionsJSON: options as never,
      })) as unknown as PasskeyCredential;
    } catch (cause) {
      return cancelledIfDismissed(cause);
    }
  },

  async assert(options) {
    try {
      return (await startAuthentication({
        optionsJSON: options as never,
        /*
         * No conditional mediation, deliberately (ADR 19). Autofill-driven
         * passkeys put the prompt on the screen as soon as the page loads,
         * which is exactly the "it re-prompts" behaviour that turns a cut
         * finger into being locked out of your own garage. The prompt happens
         * because somebody pressed a button.
         */
        useBrowserAutofill: false,
      })) as unknown as PasskeyCredential;
    } catch (cause) {
      return cancelledIfDismissed(cause);
    }
  },
};
