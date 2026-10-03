import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  LOGIN_ATTEMPT_LIMIT,
  TEST_PASSWORD,
  TEST_USERNAME,
  createTestApi,
  type TestApi,
} from "./testing/test-api.js";

/**
 * # Changing your own password: `POST /auth/password` (ADR 26, amended)
 *
 * Anybody signed in may, at any time. With a temporary password it is the
 * one thing they may do, and it does not ask for the temporary one: having
 * just signed in with it is the proof. Otherwise it asks for the current
 * password, refused exactly as a sign-in refuses a wrong one and counted by
 * the same limiter, because a session left open on a borrowed laptop must
 * not be able to lock its owner out.
 *
 * On success every OTHER session of the person ends; the one in use stays.
 */
describe("changing your own password", () => {
  let api: TestApi;
  let admin: string;

  const CHOSEN = "a-password-of-my-own";

  beforeAll(async () => {
    api = await createTestApi();
  });

  afterAll(async () => {
    await api.destroy();
  });

  beforeEach(async () => {
    await api.reset();
    await api.createUser(TEST_USERNAME, TEST_PASSWORD);
    admin = await api.login();
  });

  const change = async (token: string, payload: object) =>
    await api.app.inject({
      method: "POST",
      url: "/auth/password",
      headers: api.authHeaders(token),
      payload,
    });

  const me = async (token: string) =>
    await api.app.inject({ method: "GET", url: "/auth/me", headers: api.authHeaders(token) });

  const signIn = async (username: string, password: string) =>
    await api.app.inject({ method: "POST", url: "/auth/login", payload: { username, password } });

  describe("with a temporary password", () => {
    let temporaryPassword: string;
    let child: string;

    beforeEach(async () => {
      const response = await api.app.inject({
        method: "POST",
        url: "/auth/accounts",
        headers: api.authHeaders(admin),
        payload: { username: "child", role: "user" },
      });
      ({ temporaryPassword } = response.json() as { temporaryPassword: string });
      child = await api.login("child", temporaryPassword);
    });

    it("takes a new one without asking for the temporary one, and lifts the restriction", async () => {
      const response = await change(child, { password: CHOSEN });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ user: { username: "child", mustChangePassword: false } });
      expect((await me(child)).json()).toMatchObject({ user: { mustChangePassword: false } });
      expect(
        (await api.app.inject({ method: "GET", url: "/storage-units", headers: api.authHeaders(child) }))
          .statusCode,
      ).toBe(200);
    });

    it("is the end of the temporary one: only the new one signs in", async () => {
      await change(child, { password: CHOSEN });

      expect((await signIn("child", temporaryPassword)).statusCode).toBe(401);
      expect((await signIn("child", CHOSEN)).statusCode).toBe(200);
    });

    it("keeps the session in use, and ends every other one of theirs", async () => {
      const otherDevice = await api.login("child", temporaryPassword);

      await change(child, { password: CHOSEN });

      expect((await me(child)).statusCode).toBe(200);
      expect((await me(otherDevice)).statusCode).toBe(401);
      expect((await me(admin)).statusCode).toBe(200);
    });

    it("refuses a password shorter than twelve characters, and the restriction stays", async () => {
      const response = await change(child, { password: "x".repeat(11) });

      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({
        error: { code: "PASSWORD_TOO_SHORT", details: { minimumLength: 12 } },
      });
      expect((await me(child)).json()).toMatchObject({ user: { mustChangePassword: true } });
    });

    it("refuses the temporary password itself as the new one", async () => {
      const response = await change(child, { password: temporaryPassword });

      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({ error: { code: "PASSWORD_UNCHANGED" } });
      expect((await me(child)).json()).toMatchObject({ user: { mustChangePassword: true } });
    });
  });

  describe("with a password of your own", () => {
    it("changes it, given the current one", async () => {
      const response = await change(admin, { currentPassword: TEST_PASSWORD, password: CHOSEN });

      expect(response.statusCode).toBe(200);
      expect((await signIn(TEST_USERNAME, CHOSEN)).statusCode).toBe(200);
      expect((await signIn(TEST_USERNAME, TEST_PASSWORD)).statusCode).toBe(401);
    });

    it("keeps the session in use, and ends every other one of yours", async () => {
      const laptop = await api.login();

      await change(admin, { currentPassword: TEST_PASSWORD, password: CHOSEN });

      expect((await me(admin)).statusCode).toBe(200);
      expect((await me(laptop)).statusCode).toBe(401);
    });

    it("requires the current one", async () => {
      const response = await change(admin, { password: CHOSEN });

      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({ error: { code: "CURRENT_PASSWORD_REQUIRED" } });
      expect((await signIn(TEST_USERNAME, TEST_PASSWORD)).statusCode).toBe(200);
    });

    it("refuses a wrong current one exactly as a sign-in does, and changes nothing", async () => {
      const response = await change(admin, { currentPassword: "not-my-password", password: CHOSEN });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ error: { code: "INVALID_CREDENTIALS" } });
      expect((await signIn(TEST_USERNAME, TEST_PASSWORD)).statusCode).toBe(200);
    });

    it("counts wrong current ones against the sign-in limiter", async () => {
      for (let attempt = 0; attempt < LOGIN_ATTEMPT_LIMIT; attempt += 1) {
        await change(admin, { currentPassword: "not-my-password", password: CHOSEN });
      }

      const response = await change(admin, { currentPassword: TEST_PASSWORD, password: CHOSEN });

      expect(response.statusCode).toBe(429);
      expect((await signIn(TEST_USERNAME, TEST_PASSWORD)).statusCode).toBe(429);
    });

    it("refuses the current password as the new one", async () => {
      const response = await change(admin, {
        currentPassword: TEST_PASSWORD,
        password: TEST_PASSWORD,
      });

      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({ error: { code: "PASSWORD_UNCHANGED" } });
    });

    it("refuses a key it does not know", async () => {
      const response = await change(admin, {
        currentPassword: TEST_PASSWORD,
        password: CHOSEN,
        username: "someone-else",
      });

      expect(response.statusCode).toBe(400);
    });
  });

  /** A machine token is not a person, and a password opens one (ADR 18). */
  it("refuses a machine token, whatever its scope", async () => {
    const token = await api.createMachineToken("dario-mcp", "read-write");

    const response = await api.app.inject({
      method: "POST",
      url: "/auth/password",
      headers: api.machineHeaders(token),
      payload: { currentPassword: TEST_PASSWORD, password: CHOSEN },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: "MACHINE_TOKEN_CANNOT_MANAGE_ACCOUNTS" } });
    expect((await signIn(TEST_USERNAME, TEST_PASSWORD)).statusCode).toBe(200);
  });
});
