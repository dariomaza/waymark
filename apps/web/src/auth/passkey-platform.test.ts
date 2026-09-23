import { afterEach, describe, expect, it } from "vitest";

import {
  browserPasskeyPlatform,
  PasskeyCancelled,
  PasskeyCeremonyFailed,
} from "./passkey-platform.js";

/**
 * # What the browser throws, and what this app is allowed to say about it
 *
 * The one case this file exists for happened on a real phone: the API answered
 * `POST /auth/passkeys/options` with 200, twice, the finishing request was
 * never sent, and the screen said "Waymark had a problem answering". The
 * browser had thrown a `DOMException` that nothing here recognised, so it
 * travelled up raw and was described by the only sentence left.
 *
 * ## Why the real library runs here
 *
 * `navigator.credentials` is the operating system's, so it is stood in for —
 * and NOTHING else is. `@simplewebauthn/browser` runs for real, which is the
 * whole point: what is being pinned down is the shape of the error it hands
 * back for a given `DOMException`, and a stubbed library would only prove that
 * a stub was called. That shape is a dependency's, it changed across majors
 * (ADR 19), and it is exactly the thing that must not drift silently.
 */
const asIfTheAuthenticatorThrows = (cause: unknown): void => {
  Object.defineProperty(globalThis, "PublicKeyCredential", {
    configurable: true,
    writable: true,
    value: function PublicKeyCredential() {
      // Only its existence is read, by `browserSupportsWebAuthn`.
    },
  });

  Object.defineProperty(navigator, "credentials", {
    configurable: true,
    writable: true,
    value: {
      create: () => {
        throw cause;
      },
      get: () => {
        throw cause;
      },
    },
  });
};

afterEach(() => {
  Reflect.deleteProperty(globalThis, "PublicKeyCredential");
  Reflect.deleteProperty(navigator, "credentials");
});

/** The shape the API sends, with the deployment's own RP ID in it (ADR 19). */
const registrationOptions = {
  challenge: "Y2hhbGxlbmdl",
  rp: { id: "waymark.idemcloud.uk", name: "Waymark" },
  user: { id: "dXNlci1pZA", name: "dario", displayName: "dario" },
  pubKeyCredParams: [{ alg: -7, type: "public-key" }],
  authenticatorSelection: {
    authenticatorAttachment: "platform",
    residentKey: "required",
    requireResidentKey: true,
    userVerification: "required",
  },
};

const authenticationOptions = {
  challenge: "Y2hhbGxlbmdl",
  rpId: "waymark.idemcloud.uk",
  allowCredentials: [],
  userVerification: "required",
};

const domException = (name: string): DOMException =>
  new DOMException(`the authenticator said ${name}`, name);

describe("a ceremony the device could not finish", () => {
  it("is a failure of its own, carrying the browser's name for it", async () => {
    asIfTheAuthenticatorThrows(domException("NotSupportedError"));

    await expect(browserPasskeyPlatform.register(registrationOptions)).rejects.toBeInstanceOf(
      PasskeyCeremonyFailed,
    );
  });

  it("carries the name and the library's code, because that pair is the diagnosis", async () => {
    asIfTheAuthenticatorThrows(domException("NotSupportedError"));

    const failure = await browserPasskeyPlatform
      .register(registrationOptions)
      .catch((error: unknown) => error as PasskeyCeremonyFailed);

    expect(failure.reason).toBe("NotSupportedError");
    expect(failure.code).toBe("ERROR_AUTHENTICATOR_NO_SUPPORTED_PUBKEYCREDPARAMS_ALG");
  });

  /**
   * The device this app is served from is not the one the options were issued
   * for. It is the failure ADR 19 is most afraid of, and the browser's own
   * word for it is the only thing that says so.
   */
  it("keeps the name for a mismatched address", async () => {
    asIfTheAuthenticatorThrows(domException("SecurityError"));

    const failure = await browserPasskeyPlatform
      .register(registrationOptions)
      .catch((error: unknown) => error as PasskeyCeremonyFailed);

    expect(failure.reason).toBe("SecurityError");
    expect(failure.code).toBe("ERROR_INVALID_RP_ID");
  });

  it("keeps the name when the library has no code for what happened", async () => {
    asIfTheAuthenticatorThrows(domException("NetworkError"));

    const failure = await browserPasskeyPlatform
      .register(registrationOptions)
      .catch((error: unknown) => error as PasskeyCeremonyFailed);

    expect(failure.reason).toBe("NetworkError");
    expect(failure.code).toBeNull();
  });

  it("still says something for a browser that threw what is not an error at all", async () => {
    asIfTheAuthenticatorThrows("something went wrong");

    const failure = await browserPasskeyPlatform
      .register(registrationOptions)
      .catch((error: unknown) => error as PasskeyCeremonyFailed);

    expect(failure).toBeInstanceOf(PasskeyCeremonyFailed);
    expect(failure.reason).not.toBe("");
  });

  /** Signing in has the same half, and had the same hole. */
  it("wraps a sign-in that the device could not finish", async () => {
    asIfTheAuthenticatorThrows(domException("UnknownError"));

    const failure = await browserPasskeyPlatform
      .assert(authenticationOptions)
      .catch((error: unknown) => error as PasskeyCeremonyFailed);

    expect(failure).toBeInstanceOf(PasskeyCeremonyFailed);
    expect(failure.reason).toBe("UnknownError");
    expect(failure.code).toBe("ERROR_AUTHENTICATOR_GENERAL_ERROR");
  });

  /** Keeps the original around, so a console still shows what really happened. */
  it("does not throw the browser's error away", async () => {
    const raised = domException("UnknownError");
    asIfTheAuthenticatorThrows(raised);

    const failure = await browserPasskeyPlatform
      .register(registrationOptions)
      .catch((error: unknown) => error as PasskeyCeremonyFailed);

    expect(failure.cause).toBeDefined();
  });
});

/**
 * ADR 19's rule, and the reason this file cannot simply wrap everything: a
 * dismissed prompt is NOT a failure. Nothing was refused, nothing is broken,
 * and the screen says so quietly.
 */
describe("a prompt somebody dismissed", () => {
  it("is still a cancellation and not a failure, on registration", async () => {
    asIfTheAuthenticatorThrows(domException("NotAllowedError"));

    await expect(browserPasskeyPlatform.register(registrationOptions)).rejects.toBeInstanceOf(
      PasskeyCancelled,
    );
  });

  it("is still a cancellation and not a failure, on sign-in", async () => {
    asIfTheAuthenticatorThrows(domException("NotAllowedError"));

    await expect(browserPasskeyPlatform.assert(authenticationOptions)).rejects.toBeInstanceOf(
      PasskeyCancelled,
    );
  });
});
