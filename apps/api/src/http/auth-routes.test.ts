import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { CLOUDFLARE_CLIENT_IP_HEADER } from "./client-ip.js";
import {
  LOGIN_ATTEMPT_LIMIT,
  TEST_ORIGIN,
  TEST_PASSWORD,
  TEST_USERNAME,
  createTestApi,
  type TestApi,
} from "./testing/test-api.js";

const DAY = 24 * 60 * 60 * 1000;

describe("authentication over HTTP", () => {
  let api: TestApi;

  beforeAll(async () => {
    api = await createTestApi();
  });

  afterAll(async () => {
    await api.destroy();
  });

  beforeEach(async () => {
    await api.reset();
    await api.createUser(TEST_USERNAME, TEST_PASSWORD);
  });

  describe("POST /auth/login", () => {
    it("returns a token and the account behind it", async () => {
      const response = await api.app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { username: TEST_USERNAME, password: TEST_PASSWORD },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        user: { username: TEST_USERNAME },
      });
      expect((response.json() as { token: string }).token).toEqual(
        expect.any(String),
      );
    });

    it("says when the session will lapse, so a client can log in ahead of time", async () => {
      const response = await api.app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { username: TEST_USERNAME, password: TEST_PASSWORD },
      });

      const { expiresAt } = response.json() as { expiresAt: string };
      expect(Date.parse(expiresAt) - api.clock.now().getTime()).toBe(30 * DAY);
    });

    it("never echoes the password hash", async () => {
      const response = await api.app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { username: TEST_USERNAME, password: TEST_PASSWORD },
      });

      expect(response.body).not.toContain("scrypt$");
      expect(response.body).not.toContain("passwordHash");
    });

    it("answers 401 for the wrong password", async () => {
      const response = await api.app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { username: TEST_USERNAME, password: "wrong" },
      });

      expect(response.statusCode).toBe(401);
    });

    it("answers the exact same body for an unknown user as for a wrong password", async () => {
      const unknownUser = await api.app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { username: "nobody-at-all", password: "wrong" },
      });
      const wrongPassword = await api.app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { username: TEST_USERNAME, password: "wrong" },
      });

      expect(unknownUser.statusCode).toBe(wrongPassword.statusCode);
      expect(unknownUser.body).toBe(wrongPassword.body);
    });

    it("answers 400 for a body that is not a login at all", async () => {
      const response = await api.app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { user: TEST_USERNAME },
      });

      expect(response.statusCode).toBe(400);
      expect((response.json() as { error: { code: string } }).error.code).toBe(
        "VALIDATION_FAILED",
      );
    });
  });

  describe("rate limiting the login endpoint", () => {
    const failFrom = async (clientIp: string): Promise<number> => {
      const response = await api.app.inject({
        method: "POST",
        url: "/auth/login",
        headers: { [CLOUDFLARE_CLIENT_IP_HEADER]: clientIp },
        payload: { username: TEST_USERNAME, password: "wrong" },
      });

      return response.statusCode;
    };

    const exhaust = async (clientIp: string): Promise<void> => {
      for (let attempt = 0; attempt < LOGIN_ATTEMPT_LIMIT; attempt += 1) {
        await failFrom(clientIp);
      }
    };

    it("answers 429 once the attempts are exhausted", async () => {
      await exhaust("203.0.113.7");

      expect(await failFrom("203.0.113.7")).toBe(429);
    });

    it("sends Retry-After, so a client knows when to come back", async () => {
      await exhaust("203.0.113.7");

      const response = await api.app.inject({
        method: "POST",
        url: "/auth/login",
        headers: { [CLOUDFLARE_CLIENT_IP_HEADER]: "203.0.113.7" },
        payload: { username: TEST_USERNAME, password: "wrong" },
      });

      expect(Number(response.headers["retry-after"])).toBeGreaterThan(0);
    });

    describe("which IP the limit counts", () => {
      it("counts the caller in CF-Connecting-IP, not the tunnel", async () => {
        // Every request here arrives from 127.0.0.1, exactly as it would from
        // cloudflared. Counting the socket address would block the second
        // attacker after the first one burnt the budget.
        await exhaust("203.0.113.7");

        expect(await failFrom("198.51.100.4")).toBe(401);
      });

      it("blocks the attacker rather than everybody behind the tunnel", async () => {
        await exhaust("203.0.113.7");

        const innocent = await api.app.inject({
          method: "POST",
          url: "/auth/login",
          headers: { [CLOUDFLARE_CLIENT_IP_HEADER]: "198.51.100.4" },
          payload: { username: TEST_USERNAME, password: TEST_PASSWORD },
        });

        expect(innocent.statusCode).toBe(200);
      });

      it("ignores the header when the request did not come through the tunnel", async () => {
        // Somebody on the LAN, hitting the port directly and rotating a forged
        // header on every attempt. The socket address is what counts for them.
        for (let attempt = 0; attempt < LOGIN_ATTEMPT_LIMIT; attempt += 1) {
          await api.app.inject({
            method: "POST",
            url: "/auth/login",
            remoteAddress: "192.0.2.50",
            headers: { [CLOUDFLARE_CLIENT_IP_HEADER]: `203.0.113.${attempt}` },
            payload: { username: TEST_USERNAME, password: "wrong" },
          });
        }

        const response = await api.app.inject({
          method: "POST",
          url: "/auth/login",
          remoteAddress: "192.0.2.50",
          headers: { [CLOUDFLARE_CLIENT_IP_HEADER]: "203.0.113.99" },
          payload: { username: TEST_USERNAME, password: "wrong" },
        });

        expect(response.statusCode).toBe(429);
      });

      it("falls back to the socket address when the header is absent", async () => {
        for (let attempt = 0; attempt < LOGIN_ATTEMPT_LIMIT; attempt += 1) {
          await api.app.inject({
            method: "POST",
            url: "/auth/login",
            payload: { username: TEST_USERNAME, password: "wrong" },
          });
        }

        const response = await api.app.inject({
          method: "POST",
          url: "/auth/login",
          payload: { username: TEST_USERNAME, password: "wrong" },
        });

        expect(response.statusCode).toBe(429);
      });

      it("ignores a header that is not a single IP address", async () => {
        for (let attempt = 0; attempt < LOGIN_ATTEMPT_LIMIT; attempt += 1) {
          await api.app.inject({
            method: "POST",
            url: "/auth/login",
            headers: { [CLOUDFLARE_CLIENT_IP_HEADER]: `not-an-ip-${attempt}` },
            payload: { username: TEST_USERNAME, password: "wrong" },
          });
        }

        const response = await api.app.inject({
          method: "POST",
          url: "/auth/login",
          headers: { [CLOUDFLARE_CLIENT_IP_HEADER]: "still-not-an-ip" },
          payload: { username: TEST_USERNAME, password: "wrong" },
        });

        expect(response.statusCode).toBe(429);
      });
    });
  });

  describe("presenting a session", () => {
    it("lets a valid token through", async () => {
      const token = await api.login();

      const response = await api.app.inject({
        method: "GET",
        url: "/auth/me",
        headers: api.authHeaders(token),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        user: { id: expect.any(String), username: TEST_USERNAME },
      });
    });

    it("answers 401 with no Authorization header at all", async () => {
      const response = await api.app.inject({ method: "GET", url: "/auth/me" });

      expect(response.statusCode).toBe(401);
    });

    it("answers 401 for a token nobody issued", async () => {
      const response = await api.app.inject({
        method: "GET",
        url: "/auth/me",
        headers: api.authHeaders("a-token-i-made-up"),
      });

      expect(response.statusCode).toBe(401);
    });

    it("answers 401 for a scheme that is not Bearer", async () => {
      const token = await api.login();

      const response = await api.app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { authorization: `Basic ${token}` },
      });

      expect(response.statusCode).toBe(401);
    });

    it("tells the client which scheme to use", async () => {
      const response = await api.app.inject({ method: "GET", url: "/auth/me" });

      expect(response.headers["www-authenticate"]).toBe("Bearer");
    });

    it("answers 401 once the session has expired", async () => {
      const token = await api.login();
      api.clock.advanceBy(31 * DAY);

      const response = await api.app.inject({
        method: "GET",
        url: "/auth/me",
        headers: api.authHeaders(token),
      });

      expect(response.statusCode).toBe(401);
    });

    it("keeps working for a session that is used regularly", async () => {
      const token = await api.login();

      for (let week = 0; week < 10; week += 1) {
        api.clock.advanceBy(7 * DAY);
        const response = await api.app.inject({
          method: "GET",
          url: "/auth/me",
          headers: api.authHeaders(token),
        });
        expect(response.statusCode).toBe(200);
      }
    });
  });

  describe("POST /auth/logout", () => {
    it("revokes the token", async () => {
      const token = await api.login();

      const logout = await api.app.inject({
        method: "POST",
        url: "/auth/logout",
        headers: api.authHeaders(token),
      });
      expect(logout.statusCode).toBe(204);

      const after = await api.app.inject({
        method: "GET",
        url: "/auth/me",
        headers: api.authHeaders(token),
      });
      expect(after.statusCode).toBe(401);
    });

    it("leaves the other devices of the same account signed in", async () => {
      const phone = await api.login();
      const laptop = await api.login();

      await api.app.inject({
        method: "POST",
        url: "/auth/logout",
        headers: api.authHeaders(phone),
      });

      const response = await api.app.inject({
        method: "GET",
        url: "/auth/me",
        headers: api.authHeaders(laptop),
      });
      expect(response.statusCode).toBe(200);
    });

    it("needs a session of its own to revoke", async () => {
      const response = await api.app.inject({
        method: "POST",
        url: "/auth/logout",
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("there is no sign-up", () => {
    it.each([
      ["POST", "/auth/register"],
      ["POST", "/auth/signup"],
      ["POST", "/users"],
    ])("answers 404 for %s %s", async (method, url) => {
      const response = await api.app.inject({
        method: method as "POST",
        url,
        payload: { username: "intruder", password: "intruder" },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("GET /health", () => {
    it("answers without a session, because a probe has no credentials", async () => {
      const response = await api.app.inject({ method: "GET", url: "/health" });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: "ok" });
    });
  });

  describe("security headers", () => {
    it("tells browsers not to sniff the content type", async () => {
      const response = await api.app.inject({ method: "GET", url: "/health" });

      expect(response.headers["x-content-type-options"]).toBe("nosniff");
    });

    it("refuses to be framed", async () => {
      const response = await api.app.inject({ method: "GET", url: "/health" });

      expect(response.headers["x-frame-options"]).toBe("DENY");
    });

    it("asks for HTTPS only, since the tunnel terminates TLS at Cloudflare", async () => {
      const response = await api.app.inject({ method: "GET", url: "/health" });

      expect(response.headers["strict-transport-security"]).toContain("max-age=");
    });

    it("leaks no referrer to anywhere", async () => {
      const response = await api.app.inject({ method: "GET", url: "/health" });

      expect(response.headers["referrer-policy"]).toBe("no-referrer");
    });

    it("forbids loading anything at all, because this API returns JSON only", async () => {
      const response = await api.app.inject({ method: "GET", url: "/health" });

      expect(response.headers["content-security-policy"]).toContain(
        "default-src 'none'",
      );
    });
  });

  describe("CORS", () => {
    it("lets the configured PWA origin call the API", async () => {
      const response = await api.app.inject({
        method: "OPTIONS",
        url: "/auth/login",
        headers: {
          origin: TEST_ORIGIN,
          "access-control-request-method": "POST",
          "access-control-request-headers": "authorization,content-type",
        },
      });

      expect(response.headers["access-control-allow-origin"]).toBe(TEST_ORIGIN);
      expect(response.headers["access-control-allow-headers"]).toContain(
        "Authorization",
      );
    });

    it("does not answer for an origin nobody allowed", async () => {
      const response = await api.app.inject({
        method: "OPTIONS",
        url: "/auth/login",
        headers: {
          origin: "https://evil.example",
          "access-control-request-method": "POST",
        },
      });

      expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    });

    it("never reflects an arbitrary origin back", async () => {
      const response = await api.app.inject({
        method: "GET",
        url: "/health",
        headers: { origin: "https://evil.example" },
      });

      expect(response.headers["access-control-allow-origin"]).not.toBe(
        "https://evil.example",
      );
    });

    it("serves a caller with no Origin header, which is what the Expo app is", async () => {
      const token = await api.login();

      const response = await api.app.inject({
        method: "GET",
        url: "/auth/me",
        headers: api.authHeaders(token),
      });

      expect(response.statusCode).toBe(200);
    });

    it("does not allow credentials, because the session is a header and not a cookie", async () => {
      const response = await api.app.inject({
        method: "OPTIONS",
        url: "/auth/login",
        headers: {
          origin: TEST_ORIGIN,
          "access-control-request-method": "POST",
        },
      });

      expect(response.headers["access-control-allow-credentials"]).toBeUndefined();
    });
  });
});
