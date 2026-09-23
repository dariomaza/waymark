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
      WAYMARK_ALLOWED_ORIGINS: "https://waymark.example, https://pwa.example",
    });

    expect(config.security.allowedOrigins).toEqual([
      "https://waymark.example",
      "https://pwa.example",
    ]);
  });

  it("reads a proxy on a container network", () => {
    const config = loadConfig({ WAYMARK_TRUSTED_PROXIES: "172.18.0.2" });

    expect([...config.security.trustedProxies]).toEqual(["172.18.0.2"]);
  });

  it("can trust nothing at all, which disables the CF-Connecting-IP header", () => {
    const config = loadConfig({ WAYMARK_TRUSTED_PROXIES: "" });

    expect([...config.security.trustedProxies]).toEqual([]);
  });

  it("limits failed logins per address", () => {
    const config = loadConfig({});

    expect(config.login.limit).toBe(10);
    expect(config.login.windowMs).toBe(15 * 60_000);
  });

  it("reads the limit from the environment", () => {
    const config = loadConfig({
      WAYMARK_LOGIN_ATTEMPT_LIMIT: "3",
      WAYMARK_LOGIN_WINDOW_MINUTES: "60",
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
      WAYMARK_PUBLIC_BASE_URL: "https://waymark.example",
    });

    expect(config.publicBaseUrl).toBe("https://waymark.example");
  });

  it("drops a trailing slash so the URL is built the same way every time", () => {
    const config = loadConfig({
      WAYMARK_PUBLIC_BASE_URL: "https://waymark.example/",
    });

    expect(config.publicBaseUrl).toBe("https://waymark.example");
  });

  it("keeps a path prefix, for an app served under a subpath", () => {
    const config = loadConfig({
      WAYMARK_PUBLIC_BASE_URL: "https://home.example/waymark",
    });

    expect(config.publicBaseUrl).toBe("https://home.example/waymark");
  });

  /**
   * # The base URL now decides one more thing (ADR 19)
   *
   * A passkey's RP ID and expected origin are derived from it rather than
   * configured beside it, so a base URL no browser will run WebAuthn against
   * is a deployment where every fingerprint fails — at 1am, with a
   * browser-side error that names nothing. It is refused here instead, by
   * name, in the one place this project already refuses a misconfiguration.
   */
  describe("the relying party a passkey is minted for", () => {
    it("derives it from the public base URL, with no variable of its own", () => {
      const config = loadConfig({
        WAYMARK_PUBLIC_BASE_URL: "https://waymark.idemcloud.uk",
      });

      expect(config.relyingParty).toEqual({
        id: "waymark.idemcloud.uk",
        name: "Waymark",
        origin: "https://waymark.idemcloud.uk",
      });
    });

    it("derives it from a checkout's loopback default too", () => {
      const config = loadConfig({});

      expect(config.relyingParty).toEqual({
        id: "localhost",
        name: "Waymark",
        origin: "http://localhost:5173",
      });
    });

    it("keeps the id free of the path a base URL may carry", () => {
      const config = loadConfig({
        WAYMARK_PUBLIC_BASE_URL: "https://home.example/waymark",
      });

      expect(config.relyingParty.id).toBe("home.example");
      expect(config.relyingParty.origin).toBe("https://home.example");
    });

    it("refuses plain HTTP on a real host, rather than booting into silence", () => {
      expect(() =>
        loadConfig({ WAYMARK_PUBLIC_BASE_URL: "http://192.168.1.10:5173" }),
      ).toThrow(InvalidConfiguration);
    });

    it("says which variable is wrong and why, because that is the whole point", () => {
      expect(() =>
        loadConfig({ WAYMARK_PUBLIC_BASE_URL: "http://waymark.idemcloud.uk" }),
      ).toThrow(/WAYMARK_PUBLIC_BASE_URL.*secure context/isu);
    });
  });

  it("stores photos on a plain directory next to the process by default", () => {
    const config = loadConfig({});

    expect(config.photos.root).toBe("data/photos");
  });

  it("reads the photo root, which is a docker volume in production", () => {
    const config = loadConfig({ WAYMARK_PHOTO_ROOT: "/data/photos" });

    expect(config.photos.root).toBe("/data/photos");
  });

  it("accepts a phone photo without accepting a disk filler", () => {
    const config = loadConfig({});

    expect(config.photos.maxBytes).toBe(12 * 1024 * 1024);
  });

  it("reads the upload limit in megabytes", () => {
    const config = loadConfig({ WAYMARK_MAX_PHOTO_MB: "25" });

    expect(config.photos.maxBytes).toBe(25 * 1024 * 1024);
  });

  it("passes the database url straight through", () => {
    const config = loadConfig({ DATABASE_URL: "file:/data/waymark.db" });

    expect(config.databaseUrl).toBe("file:/data/waymark.db");
  });

  describe("background removal", () => {
    /**
     * ADR 4: the sidecar is optional. An installation that never sets the URL
     * is a complete, working installation, so the absence of the variable is
     * the OFF switch and not a misconfiguration.
     */
    it("is switched off when no sidecar is named", () => {
      const config = loadConfig({});

      expect(config.imageProcessing.url).toBeNull();
    });

    it("is switched off by an empty value, not left half-configured", () => {
      const config = loadConfig({ WAYMARK_IMAGE_PROCESSOR_URL: "   " });

      expect(config.imageProcessing.url).toBeNull();
    });

    it("reads the sidecar address and trims the trailing slash", () => {
      const config = loadConfig({
        WAYMARK_IMAGE_PROCESSOR_URL: "http://image-processor:8000/",
      });

      expect(config.imageProcessing.url).toBe("http://image-processor:8000");
    });

    /**
     * rembg saturates every core it is given for a single image, so a second
     * concurrent request does not raise throughput: it doubles latency and
     * doubles the resident memory on a box that is also serving the API.
     */
    it("processes one photo at a time by default", () => {
      const config = loadConfig({});

      expect(config.imageProcessing.concurrency).toBe(1);
    });

    it("waits two minutes for a sidecar on a slow homelab CPU", () => {
      const config = loadConfig({});

      expect(config.imageProcessing.timeoutMs).toBe(120_000);
    });

    it("gives up on a photo after five attempts", () => {
      const config = loadConfig({});

      expect(config.imageProcessing.maxAttempts).toBe(5);
    });

    it("looks for work every fifteen seconds", () => {
      const config = loadConfig({});

      expect(config.imageProcessing.pollIntervalMs).toBe(15_000);
    });

    it("reads every knob from the environment", () => {
      const config = loadConfig({
        WAYMARK_IMAGE_PROCESSOR_URL: "http://sidecar:8000",
        WAYMARK_IMAGE_PROCESSOR_TIMEOUT_SECONDS: "30",
        WAYMARK_IMAGE_PROCESSOR_CONCURRENCY: "2",
        WAYMARK_IMAGE_PROCESSOR_MAX_ATTEMPTS: "3",
        WAYMARK_IMAGE_PROCESSOR_POLL_SECONDS: "5",
      });

      expect(config.imageProcessing).toEqual({
        url: "http://sidecar:8000",
        timeoutMs: 30_000,
        concurrency: 2,
        maxAttempts: 3,
        pollIntervalMs: 5_000,
      });
    });
  });

  describe("the built web client", () => {
    it("serves none at all until one is named", () => {
      // An API on its own is a complete configuration: it is what `vite dev`
      // runs against, and what a checkout with no build in it has.
      const config = loadConfig({});

      expect(config.webRoot).toBeNull();
    });

    it("reads the directory the image bakes the client into", () => {
      const config = loadConfig({ WAYMARK_WEB_ROOT: "/repo/apps/web/dist" });

      expect(config.webRoot).toBe("/repo/apps/web/dist");
    });

    it("treats a blank value as no client, so an unset variable in compose is not a crash", () => {
      const config = loadConfig({ WAYMARK_WEB_ROOT: "   " });

      expect(config.webRoot).toBeNull();
    });
  });

  describe("refuses nonsense rather than starting with it", () => {
    it.each([
      ["a port that is not a number", { PORT: "http" }],
      ["a port outside the valid range", { PORT: "70000" }],
      ["a login limit of zero", { WAYMARK_LOGIN_ATTEMPT_LIMIT: "0" }],
      ["a negative login window", { WAYMARK_LOGIN_WINDOW_MINUTES: "-5" }],
      ["an origin that is not an origin", { WAYMARK_ALLOWED_ORIGINS: "waymark.example" }],
      ["an origin with a path", { WAYMARK_ALLOWED_ORIGINS: "https://a.example/app" }],
      ["a trusted proxy that is not an IP", { WAYMARK_TRUSTED_PROXIES: "cloudflared" }],
      ["a base URL that is not absolute", { WAYMARK_PUBLIC_BASE_URL: "waymark.example" }],
      ["a base URL with a query", { WAYMARK_PUBLIC_BASE_URL: "https://a.example/?x=1" }],
      ["a base URL that is not http", { WAYMARK_PUBLIC_BASE_URL: "ftp://a.example" }],
      ["an empty photo root", { WAYMARK_PHOTO_ROOT: "   " }],
      ["a photo limit of zero", { WAYMARK_MAX_PHOTO_MB: "0" }],
      ["a photo limit that is not a number", { WAYMARK_MAX_PHOTO_MB: "big" }],
      [
        "a sidecar address that is not absolute",
        { WAYMARK_IMAGE_PROCESSOR_URL: "image-processor:8000" },
      ],
      [
        "a sidecar address that is not http",
        { WAYMARK_IMAGE_PROCESSOR_URL: "tcp://image-processor:8000" },
      ],
      [
        "a sidecar address carrying a query",
        { WAYMARK_IMAGE_PROCESSOR_URL: "http://sidecar:8000/?model=u2net" },
      ],
      ["a concurrency of zero", { WAYMARK_IMAGE_PROCESSOR_CONCURRENCY: "0" }],
      ["a timeout of zero", { WAYMARK_IMAGE_PROCESSOR_TIMEOUT_SECONDS: "0" }],
      ["no attempts at all", { WAYMARK_IMAGE_PROCESSOR_MAX_ATTEMPTS: "0" }],
      ["a poll interval that is not a number", { WAYMARK_IMAGE_PROCESSOR_POLL_SECONDS: "often" }],
    ])("rejects %s", (_name, env) => {
      expect(() => loadConfig(env)).toThrow(InvalidConfiguration);
    });
  });
});
