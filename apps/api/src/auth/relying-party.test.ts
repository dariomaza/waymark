import { describe, expect, it } from "vitest";

import {
  relyingPartyFor,
  RELYING_PARTY_NAME,
  webAuthnObjectionTo,
} from "./relying-party.js";

describe("the relying party a passkey is minted for", () => {
  it("takes its id from the host the person's browser is at", () => {
    expect(relyingPartyFor("https://waymark.idemcloud.uk").id).toBe(
      "waymark.idemcloud.uk",
    );
  });

  it("takes its expected origin from the same URL, whole", () => {
    expect(relyingPartyFor("https://waymark.idemcloud.uk").origin).toBe(
      "https://waymark.idemcloud.uk",
    );
  });

  /**
   * A path prefix is a legal public base URL — an app served under
   * `/waymark` — and an origin has no path in it. A passkey minted at
   * `https://host/waymark` and one minted at `https://host/` are the same
   * credential, because the browser says so.
   */
  it("drops a path prefix, because an origin does not have one", () => {
    const relyingParty = relyingPartyFor("https://waymark.idemcloud.uk/waymark");

    expect(relyingParty.origin).toBe("https://waymark.idemcloud.uk");
    expect(relyingParty.id).toBe("waymark.idemcloud.uk");
  });

  it("keeps a port, because a browser sends one in the origin", () => {
    expect(relyingPartyFor("http://localhost:5173").origin).toBe(
      "http://localhost:5173",
    );
  });

  it("leaves the port out of the id, because an RP id is a domain", () => {
    expect(relyingPartyFor("http://localhost:5173").id).toBe("localhost");
  });

  it("is called Waymark, which is what the browser's prompt says", () => {
    expect(relyingPartyFor("https://waymark.idemcloud.uk").name).toBe(
      RELYING_PARTY_NAME,
    );
  });
});

describe("a base URL a browser will never run a ceremony against", () => {
  it("objects to plain HTTP on a real host, because WebAuthn needs a secure context", () => {
    expect(webAuthnObjectionTo("http://waymark.idemcloud.uk")).toMatch(
      /secure context/iu,
    );
  });

  it("names the scheme it was given, so the message says what to change", () => {
    expect(webAuthnObjectionTo("http://192.168.1.10:5173")).toContain("http:");
  });

  it("accepts loopback by name, which is how a checkout runs", () => {
    expect(webAuthnObjectionTo("http://localhost:5173")).toBeNull();
  });

  it("accepts loopback by address too", () => {
    expect(webAuthnObjectionTo("http://127.0.0.1:3000")).toBeNull();
  });

  it("accepts HTTPS anywhere, which is every deployment", () => {
    expect(webAuthnObjectionTo("https://waymark.idemcloud.uk")).toBeNull();
  });

  it("objects to a scheme no browser opens at all", () => {
    expect(webAuthnObjectionTo("ftp://waymark.idemcloud.uk")).not.toBeNull();
  });

  it("objects to something that is not a URL rather than crashing on it", () => {
    expect(webAuthnObjectionTo("waymark.idemcloud.uk")).not.toBeNull();
  });

  /**
   * The refusal belongs at boot. Building a relying party out of a base URL
   * nothing will honour has exactly one correct outcome, and it is not a
   * relying party.
   */
  it("refuses to build a relying party out of one", () => {
    expect(() => relyingPartyFor("http://waymark.idemcloud.uk")).toThrow(
      /secure context/iu,
    );
  });
});
