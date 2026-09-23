import {
  createHash,
  createSign,
  generateKeyPairSync,
  type KeyObject,
} from "node:crypto";

import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";

/**
 * # An authenticator made of `node:crypto`, so the ceremonies can be watched
 *
 * Nobody working on this has a phone, a fingerprint reader or a security key
 * in the test run, and a test that stubs the verifier proves only that the
 * stub was called. So this is a real one: a P-256 key pair, real CBOR, real
 * `authenticatorData`, and a real ECDSA signature over exactly the bytes
 * WebAuthn says an authenticator signs.
 *
 * What that buys is the difference between asserting and observing. With this,
 * `@simplewebauthn/server` is exercised end to end — a registration is
 * verified, an assertion is verified against the key that registration stored,
 * a signature over the wrong challenge is rejected, an RP ID that is not ours
 * is rejected, and the counter rule is driven through every case it has.
 *
 * ## This is not the thing ADR 19 refused to write
 *
 * ADR 19 says the VERIFIER must be a library, because a subtle mistake in
 * verification silently accepts something it should not. This is the other
 * side: a mistake here makes a test fail, loudly, and every byte it produces
 * is handed straight to somebody else's verifier to judge. It is a fixture,
 * and it is roughly a hundred lines because the attestation format is `none`
 * and there is nothing to attest.
 *
 * ## What it still cannot tell us
 *
 * Whether a real Pixel, a real Mac and a real YubiKey behave as the
 * specification says. This one does, by construction. Every "the authenticator
 * would…" claim in this suite is a claim about the protocol, never an
 * observation of hardware.
 */

const AAGUID_LENGTH = 16;

/** User present. */
const FLAG_UP = 0x01;
/** User verified — the fingerprint, the PIN, the face. */
const FLAG_UV = 0x04;
/** Attested credential data follows. Only a registration carries it. */
const FLAG_AT = 0x40;

export interface SoftwareAuthenticatorOptions {
  /**
   * What this authenticator believes the page's origin is. A test points it
   * somewhere else to play the part of a passkey minted for another site.
   */
  readonly origin: string;
  /** The RP ID it hashes into the signed bytes. */
  readonly rpId: string;
  /**
   * Whether it reports having checked that this is really the person.
   *
   * `false` is the security key with no PIN and no sensor: it can prove it is
   * present, and cannot prove who is holding it.
   */
  readonly userVerified?: boolean;
  /** What it reports as its signature counter. Most real ones always say 0. */
  readonly signCount?: number;
}

export interface CeremonyOverrides {
  /** Sign a different challenge than the one that was asked for: a replay. */
  readonly challenge?: string;
  readonly origin?: string;
  readonly rpId?: string;
  readonly userVerified?: boolean;
  readonly signCount?: number;
  /** Claim a `type` the ceremony did not ask for. */
  readonly type?: string;
}

export interface SoftwareAuthenticator {
  /** base64url, exactly as a browser reports it. */
  readonly credentialId: string;
  register(
    options: PublicKeyCredentialCreationOptionsJSON,
    overrides?: CeremonyOverrides,
  ): RegistrationResponseJSON;
  assert(
    options: PublicKeyCredentialRequestOptionsJSON,
    overrides?: CeremonyOverrides,
  ): AuthenticationResponseJSON;
}

export const aSoftwareAuthenticator = (
  options: SoftwareAuthenticatorOptions,
): SoftwareAuthenticator => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  const credentialIdBytes = Buffer.from(
    `credential-${Math.random().toString(36).slice(2, 12)}`,
    "utf8",
  );

  const coseKey = coseKeyOf(publicKey);

  const rpIdFor = (overrides?: CeremonyOverrides): string =>
    overrides?.rpId ?? options.rpId;
  const originFor = (overrides?: CeremonyOverrides): string =>
    overrides?.origin ?? options.origin;
  const verifiedFor = (overrides?: CeremonyOverrides): boolean =>
    overrides?.userVerified ?? options.userVerified ?? true;
  const countFor = (overrides?: CeremonyOverrides): number =>
    overrides?.signCount ?? options.signCount ?? 0;

  return {
    credentialId: base64url(credentialIdBytes),

    register(creationOptions, overrides) {
      const clientDataJSON = clientData({
        type: overrides?.type ?? "webauthn.create",
        challenge: overrides?.challenge ?? creationOptions.challenge,
        origin: originFor(overrides),
      });

      const authData = Buffer.concat([
        sha256(Buffer.from(rpIdFor(overrides), "utf8")),
        Buffer.from([
          FLAG_UP | FLAG_AT | (verifiedFor(overrides) ? FLAG_UV : 0),
        ]),
        bigEndian32(countFor(overrides)),
        // The aaguid, which this authenticator declines to identify itself
        // with — sixteen zero bytes is what `attestationType: "none"` gets,
        // and is what a real platform authenticator sends too.
        Buffer.alloc(AAGUID_LENGTH, 0),
        bigEndian16(credentialIdBytes.length),
        credentialIdBytes,
        coseKey,
      ]);

      const attestationObject = cborMap([
        [cborText("fmt"), cborText("none")],
        [cborText("attStmt"), cborMap([])],
        [cborText("authData"), cborBytes(authData)],
      ]);

      return {
        id: base64url(credentialIdBytes),
        rawId: base64url(credentialIdBytes),
        response: {
          clientDataJSON: base64url(clientDataJSON),
          attestationObject: base64url(attestationObject),
          transports: ["internal"],
        },
        type: "public-key",
        clientExtensionResults: {},
        authenticatorAttachment: "platform",
      };
    },

    assert(requestOptions, overrides) {
      const clientDataJSON = clientData({
        type: overrides?.type ?? "webauthn.get",
        challenge: overrides?.challenge ?? requestOptions.challenge,
        origin: originFor(overrides),
      });

      // No attested credential data on an assertion: the relying party already
      // has the key, so this is the header and nothing else.
      const authData = Buffer.concat([
        sha256(Buffer.from(rpIdFor(overrides), "utf8")),
        Buffer.from([FLAG_UP | (verifiedFor(overrides) ? FLAG_UV : 0)]),
        bigEndian32(countFor(overrides)),
      ]);

      // The signed bytes, exactly: the authenticator data, then the hash of
      // the client data. Getting this wrong is the mistake ADR 19 refuses to
      // risk on the verifying side; here it would simply fail every test.
      const signed = Buffer.concat([authData, sha256(clientDataJSON)]);
      const signature = createSign("SHA256").update(signed).sign(privateKey);

      return {
        id: base64url(credentialIdBytes),
        rawId: base64url(credentialIdBytes),
        response: {
          clientDataJSON: base64url(clientDataJSON),
          authenticatorData: base64url(authData),
          signature: base64url(signature),
        },
        type: "public-key",
        clientExtensionResults: {},
        authenticatorAttachment: "platform",
      };
    },
  };
};

const clientData = (fields: {
  readonly type: string;
  readonly challenge: string;
  readonly origin: string;
}): Buffer =>
  Buffer.from(
    JSON.stringify({
      type: fields.type,
      challenge: fields.challenge,
      origin: fields.origin,
      crossOrigin: false,
    }),
    "utf8",
  );

/**
 * The public key as COSE_Key, which is the only shape a verifier will read it
 * in: an EC2 key on P-256 with ES256, and its two 32-byte coordinates.
 *
 * The coordinates come out of Node's own JWK export rather than by slicing a
 * DER encoding by hand, because a coordinate that is short a leading zero is
 * a bug that appears on roughly one key in 256.
 */
const coseKeyOf = (publicKey: KeyObject): Buffer => {
  const jwk = publicKey.export({ format: "jwk" });
  const x = Buffer.from(jwk.x ?? "", "base64url");
  const y = Buffer.from(jwk.y ?? "", "base64url");

  return cborMap([
    // 1: kty, 2 = EC2
    [cborUnsigned(1), cborUnsigned(2)],
    // 3: alg, -7 = ES256
    [cborUnsigned(3), cborNegative(-7)],
    // -1: crv, 1 = P-256
    [cborNegative(-1), cborUnsigned(1)],
    [cborNegative(-2), cborBytes(x)],
    [cborNegative(-3), cborBytes(y)],
  ]);
};

/**
 * # Just enough CBOR to be an authenticator
 *
 * Five major types, no indefinite lengths, no floats, no tags. This encodes;
 * nothing here decodes, because the only reader of these bytes is the library
 * whose job that is.
 */
const cborHead = (majorType: number, value: number): Buffer => {
  if (value < 24) {
    return Buffer.from([(majorType << 5) | value]);
  }

  if (value < 0x100) {
    return Buffer.from([(majorType << 5) | 24, value]);
  }

  if (value < 0x10000) {
    const head = Buffer.alloc(3);
    head[0] = (majorType << 5) | 25;
    head.writeUInt16BE(value, 1);

    return head;
  }

  const head = Buffer.alloc(5);
  head[0] = (majorType << 5) | 26;
  head.writeUInt32BE(value, 1);

  return head;
};

const cborUnsigned = (value: number): Buffer => cborHead(0, value);

/** CBOR stores -1 as 0, -2 as 1, and so on, under major type 1. */
const cborNegative = (value: number): Buffer => cborHead(1, -value - 1);

const cborBytes = (bytes: Buffer): Buffer =>
  Buffer.concat([cborHead(2, bytes.length), bytes]);

const cborText = (text: string): Buffer => {
  const bytes = Buffer.from(text, "utf8");

  return Buffer.concat([cborHead(3, bytes.length), bytes]);
};

const cborMap = (entries: readonly (readonly [Buffer, Buffer])[]): Buffer =>
  Buffer.concat([
    cborHead(5, entries.length),
    ...entries.flatMap(([key, value]) => [key, value]),
  ]);

const sha256 = (bytes: Buffer): Buffer =>
  createHash("sha256").update(bytes).digest();

const bigEndian16 = (value: number): Buffer => {
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16BE(value);

  return bytes;
};

const bigEndian32 = (value: number): Buffer => {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value);

  return bytes;
};

const base64url = (bytes: Buffer): string => bytes.toString("base64url");
