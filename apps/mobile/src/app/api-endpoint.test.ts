import { resolveApiEndpoint } from "./api-endpoint.js";

/**
 * # The address half of a credential
 *
 * A machine token is worth nothing without the address it is presented to,
 * and that address is the one thing the account screen could get wrong in a
 * way nobody would notice until a program somewhere else was failing. It is
 * derived from the base this app already sends every request to, so the only
 * question left is the SHAPE of what gets printed and pasted.
 */
describe("the address this phone is talking to", () => {
  it("is the base the app already calls", () => {
    expect(resolveApiEndpoint("https://waymark.example")).toBe("https://waymark.example");
  });

  /**
   * The shared client builds every URL as `${base}${path}` and every path
   * begins with a slash, so a trailing one here would print `https://host//`
   * into somebody's environment file.
   */
  it("never ends in a slash, however the base was written", () => {
    expect(resolveApiEndpoint("https://waymark.example/")).toBe("https://waymark.example");
    expect(resolveApiEndpoint("https://waymark.example///")).toBe("https://waymark.example");
  });

  it("is not affected by whitespace somebody left in the environment", () => {
    expect(resolveApiEndpoint("  http://127.0.0.1:3000  ")).toBe("http://127.0.0.1:3000");
  });

  /**
   * A query string on a base is somebody's mistake, and carrying it into a
   * printed address turns that mistake into a credential that is pointed at
   * something subtly different from where the app is pointed.
   */
  it("drops a query or a fragment rather than printing it as part of the address", () => {
    expect(resolveApiEndpoint("https://waymark.example/?debug=1")).toBe(
      "https://waymark.example",
    );
    expect(resolveApiEndpoint("https://waymark.example/#top")).toBe("https://waymark.example");
  });
});
