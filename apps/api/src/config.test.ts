import { describe, expect, it } from "vitest";

import { InvalidConfiguration, loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("runs on loopback by default, because cloudflared is the only caller", () => {
    const config = loadConfig({});

    // Binding 0.0.0.0 would publish a private inventory to every device on the
    // home network as a side effect of installing a tunnel.
    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(3000);
  });

  it("trusts only loopback as a proxy by default", () => {
    const config = loadConfig({});

    expect([...config.security.trustedProxies].sort()).toEqual([
      "127.0.0.1",
      "::1",
    ]);
  });

  it("allows no browser origin until one is named", () => {
    const config = loadConfig({});

    expect(config.security.allowedOrigins).toEqual([]);
  });

  it("reads the PWA origins from the environment", () => {
    const config = loadConfig({
      ARIADNA_ALLOWED_ORIGINS: "https://ariadna.example, https://pwa.example",
    });

    expect(config.security.allowedOrigins).toEqual([
      "https://ariadna.example",
      "https://pwa.example",
    ]);
  });

  it("reads a proxy on a container network", () => {
    const config = loadConfig({ ARIADNA_TRUSTED_PROXIES: "172.18.0.2" });

    expect([...config.security.trustedProxies]).toEqual(["172.18.0.2"]);
  });

  it("can trust nothing at all, which disables the CF-Connecting-IP header", () => {
    const config = loadConfig({ ARIADNA_TRUSTED_PROXIES: "" });

    expect([...config.security.trustedProxies]).toEqual([]);
  });

  it("limits failed logins per address", () => {
    const config = loadConfig({});

    expect(config.login.limit).toBe(10);
    expect(config.login.windowMs).toBe(15 * 60_000);
  });

  it("reads the limit from the environment", () => {
    const config = loadConfig({
      ARIADNA_LOGIN_ATTEMPT_LIMIT: "3",
      ARIADNA_LOGIN_WINDOW_MINUTES: "60",
    });

    expect(config.login.limit).toBe(3);
    expect(config.login.windowMs).toBe(60 * 60_000);
  });

  it("points QR codes at the local PWA until a real hostname is configured", () => {
    const config = loadConfig({});

    expect(config.publicBaseUrl).toBe("http://localhost:5173");
  });

  it("reads the public base URL the QR codes encode", () => {
    const config = loadConfig({
      ARIADNA_PUBLIC_BASE_URL: "https://ariadna.example",
    });

    expect(config.publicBaseUrl).toBe("https://ariadna.example");
  });

  it("drops a trailing slash so the URL is built the same way every time", () => {
    const config = loadConfig({
      ARIADNA_PUBLIC_BASE_URL: "https://ariadna.example/",
    });

    expect(config.publicBaseUrl).toBe("https://ariadna.example");
  });

  it("keeps a path prefix, for an app served under a subpath", () => {
    const config = loadConfig({
      ARIADNA_PUBLIC_BASE_URL: "https://home.example/ariadna",
    });

    expect(config.publicBaseUrl).toBe("https://home.example/ariadna");
  });

  it("passes the database url straight through", () => {
    const config = loadConfig({ DATABASE_URL: "file:/data/ariadna.db" });

    expect(config.databaseUrl).toBe("file:/data/ariadna.db");
  });

  describe("refuses nonsense rather than starting with it", () => {
    it.each([
      ["a port that is not a number", { PORT: "http" }],
      ["a port outside the valid range", { PORT: "70000" }],
      ["a login limit of zero", { ARIADNA_LOGIN_ATTEMPT_LIMIT: "0" }],
      ["a negative login window", { ARIADNA_LOGIN_WINDOW_MINUTES: "-5" }],
      ["an origin that is not an origin", { ARIADNA_ALLOWED_ORIGINS: "ariadna.example" }],
      ["an origin with a path", { ARIADNA_ALLOWED_ORIGINS: "https://a.example/app" }],
      ["a trusted proxy that is not an IP", { ARIADNA_TRUSTED_PROXIES: "cloudflared" }],
      ["a base URL that is not absolute", { ARIADNA_PUBLIC_BASE_URL: "ariadna.example" }],
      ["a base URL with a query", { ARIADNA_PUBLIC_BASE_URL: "https://a.example/?x=1" }],
      ["a base URL that is not http", { ARIADNA_PUBLIC_BASE_URL: "ftp://a.example" }],
    ])("rejects %s", (_name, env) => {
      expect(() => loadConfig(env)).toThrow(InvalidConfiguration);
    });
  });
});
