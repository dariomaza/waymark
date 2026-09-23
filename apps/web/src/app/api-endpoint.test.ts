import { describe, expect, it } from "vitest";

import { apiEndpoint, resolveApiEndpoint } from "./api-endpoint.js";

/**
 * # The address of the API, and why it is not read off a build
 *
 * `VITE_WAYMARK_API_URL` is baked in when the bundle is built and is EMPTY in
 * every deployment (ADR 16), so a screen that printed it would print nothing —
 * and a dev build that printed it would print `127.0.0.1`, which is a lie on
 * the phone reading it. The truthful source is the document: this app was
 * downloaded from the API, so the address every relative request goes to is
 * the address the browser is already at.
 *
 * That is what these cases pin: the configured value is a BASE, the document
 * is what it is resolved against, and the answer is whatever the browser
 * would really call.
 */
describe("the address of the API this browser is talking to", () => {
  it("is the origin the app was served from when nothing is configured", () => {
    expect(resolveApiEndpoint("", "https://waymark.example/units/abc")).toBe(
      "https://waymark.example",
    );
  });

  it("keeps the port, because a homelab is rarely on 443", () => {
    expect(resolveApiEndpoint("", "http://192.168.1.10:8080/find?q=drill")).toBe(
      "http://192.168.1.10:8080",
    );
  });

  /** Nothing about the screen somebody happened to be on belongs in it. */
  it("carries no path, query or fragment from the document", () => {
    expect(resolveApiEndpoint("", "https://waymark.example/u/ABCDEFGHJK?x=1#y")).toBe(
      "https://waymark.example",
    );
  });

  it("uses the configured base when there is one, which is what vite dev sets", () => {
    expect(resolveApiEndpoint("http://127.0.0.1:3000", "http://localhost:5173/")).toBe(
      "http://127.0.0.1:3000",
    );
  });

  /**
   * The client builds every URL as `${base}${path}` and every path starts with
   * a slash, so a trailing one would print an address with `//` in it — which
   * is both wrong to read and wrong to paste into an environment file.
   */
  it("never ends in a slash", () => {
    expect(resolveApiEndpoint("https://waymark.example/", "https://waymark.example/")).toBe(
      "https://waymark.example",
    );
  });

  it("resolves a base that is only a path against the document, prefix and all", () => {
    expect(resolveApiEndpoint("/api", "https://waymark.example/things")).toBe(
      "https://waymark.example/api",
    );
  });

  /**
   * A base nothing can parse is a misconfiguration of the BUILD, and the
   * honest answer is still the origin the bundle came from rather than a
   * broken string somebody would paste into a config file.
   */
  it("falls back to the document's own origin rather than printing nonsense", () => {
    expect(resolveApiEndpoint("http://[::", "https://waymark.example/units")).toBe(
      "https://waymark.example",
    );
  });

  it("answers for the document the test runner is actually at", () => {
    expect(apiEndpoint()).toBe(window.location.origin);
    expect(apiEndpoint()).toBe("http://localhost:3000");
  });

});
