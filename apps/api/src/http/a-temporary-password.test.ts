import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  aSoftwareAuthenticator,
  type SoftwareAuthenticator,
} from "../auth/testing/software-authenticator.js";
import { TEST_PASSWORD, TEST_USERNAME, createTestApi, type TestApi } from "./testing/test-api.js";

/**
 * # A temporary password opens one door: the one to choose your own (ADR 26, amended)
 *
 * An administrator creates an account or resets a password, the server
 * generates a temporary one, and the person must replace it before they do
 * anything else. Until they have, a session of theirs — however it was
 * opened — may read who it is, sign out and change the password, and every
 * other route answers 403 `PASSWORD_CHANGE_REQUIRED`.
 */
describe("an account with a temporary password", () => {
  let api: TestApi;
  let admin: string;

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

  /** Creates "child" from the account screen and answers its temporary password. */
  const createChild = async (): Promise<{ id: string; temporaryPassword: string }> => {
    const response = await api.app.inject({
      method: "POST",
      url: "/auth/accounts",
      headers: api.authHeaders(admin),
      payload: { username: "child", role: "user" },
    });
    expect(response.statusCode).toBe(201);
    const { account, temporaryPassword } = response.json() as {
      account: { id: string };
      temporaryPassword: string;
    };

    return { id: account.id, temporaryPassword };
  };

  const signIn = async (username: string, password: string) =>
    await api.app.inject({ method: "POST", url: "/auth/login", payload: { username, password } });

  const call = async (method: "GET" | "POST", url: string, token: string, payload?: object) =>
    await api.app.inject({
      method,
      url,
      headers: api.authHeaders(token),
      ...(payload === undefined ? {} : { payload }),
    });

  const expectRestricted = (response: { statusCode: number; json: () => unknown }) => {
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: "PASSWORD_CHANGE_REQUIRED" } });
  };

  describe("signing in with it", () => {
    it("works, and the answer says the password must be changed", async () => {
      const { temporaryPassword } = await createChild();

      const response = await signIn("child", temporaryPassword);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ user: { username: "child", mustChangePassword: true } });
    });

    it("tells /auth/me, so a client knows which screen to show", async () => {
      const { temporaryPassword } = await createChild();
      const child = await api.login("child", temporaryPassword);

      const response = await call("GET", "/auth/me", child);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ user: { mustChangePassword: true } });
    });

    it("says nothing of the kind for an account made from the shell", async () => {
      expect((await call("GET", "/auth/me", admin)).json()).toMatchObject({
        user: { mustChangePassword: false },
      });
    });
  });

  describe("what a session of it may do", () => {
    let child: string;

    beforeEach(async () => {
      const { temporaryPassword } = await createChild();
      child = await api.login("child", temporaryPassword);
    });

    it("may not read the inventory", async () => {
      expectRestricted(await call("GET", "/storage-units", child));
    });

    it("may not change it", async () => {
      expectRestricted(await call("POST", "/storage-units", child, { name: "Garage", kind: "room" }));
    });

    it("may not add a passkey, which would outlive the temporary password", async () => {
      expectRestricted(await call("POST", "/auth/passkeys/options", child));
    });

    it("may not create a machine token", async () => {
      expectRestricted(
        await call("POST", "/auth/machine-tokens", child, { name: "child-mcp", scope: "read" }),
      );
      expectRestricted(await call("GET", "/auth/machine-tokens", child));
    });

    it("may sign out", async () => {
      expect((await call("POST", "/auth/logout", child)).statusCode).toBe(204);
      expect((await call("GET", "/auth/me", child)).statusCode).toBe(401);
    });

    it("leaves everybody else alone", async () => {
      expect((await call("GET", "/storage-units", admin)).statusCode).toBe(200);
    });
  });

  describe("after a reset", () => {
    let phone: SoftwareAuthenticator;

    const signInWithThePhone = async () => {
      const started = (
        await api.app.inject({ method: "POST", url: "/auth/passkey-login/options" })
      ).json() as { ceremonyId: string; options: Parameters<SoftwareAuthenticator["assert"]>[0] };

      return await api.app.inject({
        method: "POST",
        url: "/auth/passkey-login",
        payload: { ceremonyId: started.ceremonyId, credential: phone.assert(started.options) },
      });
    };

    beforeEach(async () => {
      await api.createUser("partner", "the-partner-password");
      const partner = await api.login("partner", "the-partner-password");
      phone = aSoftwareAuthenticator({ origin: api.relyingParty.origin, rpId: api.relyingParty.id });
      const started = (await call("POST", "/auth/passkeys/options", partner)).json() as {
        ceremonyId: string;
        options: Parameters<SoftwareAuthenticator["register"]>[0];
      };
      const added = await call("POST", "/auth/passkeys", partner, {
        ceremonyId: started.ceremonyId,
        label: "Pixel 8",
        credential: phone.register(started.options),
      });
      expect(added.statusCode).toBe(201);
    });

    const resetPartner = async (): Promise<string> => {
      const { accounts } = (await call("GET", "/auth/accounts", admin)).json() as {
        accounts: { id: string; username: string }[];
      };
      const id = accounts.find((account) => account.username === "partner")?.id ?? "";
      const response = await call("POST", `/auth/accounts/${id}/password`, admin);
      expect(response.statusCode).toBe(200);

      return (response.json() as { temporaryPassword: string }).temporaryPassword;
    };

    /** The passkey is kept (ADR 19); the restriction is the account's, not the door's. */
    it("restricts a passkey sign-in the same way", async () => {
      await resetPartner();

      const response = await signInWithThePhone();

      expect(response.statusCode).toBe(200);
      const { token, user } = response.json() as { token: string; user: object };
      expect(user).toMatchObject({ mustChangePassword: true });
      expectRestricted(await call("GET", "/storage-units", token));
      expect((await call("GET", "/auth/me", token)).statusCode).toBe(200);
    });

    /**
     * A reset does not revoke machine tokens (ADR 26), and the restriction is
     * on the person's sessions: the token was issued while the account was
     * whole, and is revoked on its own, or by disabling the account.
     */
    it("keeps the machine tokens the person already had working", async () => {
      const token = await api.createMachineToken("partner-mcp", "read", undefined, "partner");
      await resetPartner();

      const response = await api.app.inject({
        method: "GET",
        url: "/storage-units",
        headers: api.machineHeaders(token),
      });

      expect(response.statusCode).toBe(200);
    });
  });
});
