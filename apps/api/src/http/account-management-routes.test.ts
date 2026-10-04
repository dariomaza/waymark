import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  aSoftwareAuthenticator,
  type SoftwareAuthenticator,
} from "../auth/testing/software-authenticator.js";
import {
  LOGIN_ATTEMPT_LIMIT,
  TEST_PASSWORD,
  TEST_USERNAME,
  createTestApi,
  type TestApi,
} from "./testing/test-api.js";

/**
 * # An administrator manages the other accounts (ADR 26)
 *
 * Creating one, changing its role, resetting its password, disabling it and
 * enabling it again — from the account screen, behind the administrator's
 * session. The first account is still made from a shell; nothing here signs
 * anybody up.
 *
 * Who is refused is half of this file: a person who is not an administrator,
 * and every machine token whatever its scope or issuer (ADR 18's reasoning: a
 * machine never manages credentials, and a password is one).
 */
describe("managing accounts over HTTP", () => {
  let api: TestApi;
  /** The administrator's session: the first account is the administrator. */
  let admin: string;

  const PARTNER_PASSWORD = "the-partner-password";
  /** What every generated password looks like (`auth/temporary-password.ts`). */
  const TEMPORARY = /^[a-z]{4}-[a-z]{4}-[a-z]{4}-[a-z]{4}$/u;

  beforeAll(async () => {
    api = await createTestApi();
  });

  afterAll(async () => {
    await api.destroy();
  });

  beforeEach(async () => {
    await api.reset();
    await api.createUser(TEST_USERNAME, TEST_PASSWORD);
    await api.createUser("partner", PARTNER_PASSWORD);
    admin = await api.login();
  });

  interface Account {
    readonly id: string;
    readonly username: string;
    readonly role: string;
    readonly disabledAt: string | null;
    readonly mustChangePassword: boolean;
  }

  interface Issued {
    readonly account: Account;
    readonly temporaryPassword: string;
  }

  const list = async (token = admin) =>
    await api.app.inject({
      method: "GET",
      url: "/auth/accounts",
      headers: api.authHeaders(token),
    });

  const accountOf = async (username: string): Promise<Account> => {
    const { accounts } = (await list()).json() as { accounts: Account[] };
    const account = accounts.find((candidate) => candidate.username === username);
    if (account === undefined) {
      throw new Error(`No account named "${username}" in the list`);
    }

    return account;
  };

  const act = async (
    username: string,
    verb: "role" | "password" | "disable" | "enable",
    payload?: Record<string, unknown>,
    headers = api.authHeaders(admin),
  ) => {
    const { id } = await accountOf(username);

    return await api.app.inject({
      method: "POST",
      url: `/auth/accounts/${id}/${verb}`,
      headers,
      ...(payload === undefined ? {} : { payload }),
    });
  };

  /** Resets a password and answers the temporary one the response carried. */
  const reset = async (username: string): Promise<string> => {
    const response = await act(username, "password");
    expect(response.statusCode).toBe(200);

    return (response.json() as Issued).temporaryPassword;
  };

  const create = async (payload: Record<string, unknown>, headers = api.authHeaders(admin)) =>
    await api.app.inject({ method: "POST", url: "/auth/accounts", headers, payload });

  const me = async (token: string) =>
    await api.app.inject({ method: "GET", url: "/auth/me", headers: api.authHeaders(token) });

  const signIn = async (username: string, password: string) =>
    await api.app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { username, password },
    });

  describe("listing every account", () => {
    it("names each one, its role and whether it is disabled, and never a hash", async () => {
      const response = await list();

      expect(response.statusCode).toBe(200);
      const { accounts } = response.json() as { accounts: Account[] };
      expect(accounts).toEqual([
        expect.objectContaining({ username: TEST_USERNAME, role: "administrator", disabledAt: null }),
        expect.objectContaining({ username: "partner", role: "user", disabledAt: null }),
      ]);
      expect(response.body).not.toContain("scrypt");
      expect(response.body).not.toContain("passwordHash");
    });
  });

  describe("creating an account", () => {
    it("generates the password, answers it once, and the person can sign in with it", async () => {
      const response = await create({ username: "  Child ", role: "user" });

      expect(response.statusCode).toBe(201);
      const { account, temporaryPassword } = response.json() as Issued;
      expect(account).toMatchObject({ username: "child", role: "user", disabledAt: null });
      expect(temporaryPassword).toMatch(TEMPORARY);
      expect((await signIn("child", temporaryPassword)).statusCode).toBe(200);
    });

    it("never lists the password again", async () => {
      const { temporaryPassword } = (
        await create({ username: "child", role: "user" })
      ).json() as Issued;

      expect((await list()).body).not.toContain(temporaryPassword);
    });

    it("makes each account a password of its own", async () => {
      const first = (await create({ username: "child", role: "user" })).json() as Issued;
      const second = (await create({ username: "other", role: "user" })).json() as Issued;

      expect(first.temporaryPassword).not.toBe(second.temporaryPassword);
    });

    it("marks it as one whose password must be changed at the first sign-in", async () => {
      const { account } = (await create({ username: "child", role: "user" })).json() as Issued;

      expect(account.mustChangePassword).toBe(true);
      expect((await accountOf("child")).mustChangePassword).toBe(true);
    });

    /** The administrator never chooses a password that lasts (ADR 26, amended). */
    it("refuses a password in the request, as a key it does not know", async () => {
      const response = await create({
        username: "child",
        password: "the-child-password",
        role: "user",
      });

      expect(response.statusCode).toBe(400);
      expect((await signIn("child", "the-child-password")).statusCode).toBe(401);
    });

    it("makes an administrator when asked to", async () => {
      await create({ username: "second", role: "administrator" });

      expect((await accountOf("second")).role).toBe("administrator");
    });

    it("answers a username already taken with a conflict, whatever its case", async () => {
      const response = await create({ username: "PARTNER", role: "user" });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({
        error: { code: "USERNAME_ALREADY_TAKEN", details: { username: "partner" } },
      });
    });

    it("refuses a role that is not one", async () => {
      const response = await create({ username: "child", role: "owner" });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("changing a role", () => {
    it("promotes a user, and the next /auth/me says so", async () => {
      const partner = await api.login("partner", PARTNER_PASSWORD);

      const response = await act("partner", "role", { role: "administrator" });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ account: { username: "partner", role: "administrator" } });
      expect((await me(partner)).json()).toMatchObject({ user: { role: "administrator" } });
    });

    it("demotes another administrator", async () => {
      await act("partner", "role", { role: "administrator" });

      const response = await act("partner", "role", { role: "user" });

      expect(response.statusCode).toBe(200);
      expect((await accountOf("partner")).role).toBe("user");
    });

    /**
     * Another administrator has to do it. Demoting yourself is how the last
     * administrator disappears with nobody having meant it to.
     */
    it("refuses to demote yourself, with a conflict of its own", async () => {
      await act("partner", "role", { role: "administrator" });

      const response = await act(TEST_USERNAME, "role", { role: "user" });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ error: { code: "OWN_ACCOUNT" } });
      expect((await accountOf(TEST_USERNAME)).role).toBe("administrator");
    });

    it("answers 404 for an account that is not there", async () => {
      const response = await api.app.inject({
        method: "POST",
        url: "/auth/accounts/nobody/role",
        headers: api.authHeaders(admin),
        payload: { role: "user" },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ error: { code: "ACCOUNT_NOT_FOUND" } });
    });
  });

  describe("resetting a password", () => {
    it("generates a new one, answers it once, and the old one stops working", async () => {
      const response = await act("partner", "password");

      expect(response.statusCode).toBe(200);
      const { account, temporaryPassword } = response.json() as Issued;
      expect(account).toMatchObject({ username: "partner" });
      expect(temporaryPassword).toMatch(TEMPORARY);
      expect((await signIn("partner", temporaryPassword)).statusCode).toBe(200);
      expect((await signIn("partner", PARTNER_PASSWORD)).statusCode).toBe(401);
    });

    it("makes a different one every time", async () => {
      expect(await reset("partner")).not.toBe(await reset("partner"));
    });

    it("marks the account as one whose password must be changed", async () => {
      const response = await act("partner", "password");

      expect((response.json() as Issued).account.mustChangePassword).toBe(true);
      expect((await accountOf("partner")).mustChangePassword).toBe(true);
    });

    it("refuses a password in the request, and changes nothing", async () => {
      const response = await act("partner", "password", { password: "a-brand-new-password" });

      expect(response.statusCode).toBe(400);
      expect((await signIn("partner", PARTNER_PASSWORD)).statusCode).toBe(200);
      expect((await accountOf("partner")).mustChangePassword).toBe(false);
    });

    it("signs them out everywhere", async () => {
      const phone = await api.login("partner", PARTNER_PASSWORD);
      const laptop = await api.login("partner", PARTNER_PASSWORD);

      await reset("partner");

      expect((await me(phone)).statusCode).toBe(401);
      expect((await me(laptop)).statusCode).toBe(401);
    });

    it("leaves everybody else signed in", async () => {
      await reset("partner");

      expect((await me(admin)).statusCode).toBe(200);
    });

    it("keeps the machine tokens they issued, which are revoked on their own", async () => {
      const token = await api.createMachineToken("partner-mcp", "read", undefined, "partner");

      await reset("partner");

      const response = await api.app.inject({
        method: "GET",
        url: "/auth/me",
        headers: api.machineHeaders(token),
      });
      expect(response.statusCode).toBe(200);
    });

    /**
     * Your own password is changed knowing your current one, which this route
     * does not ask for. A session left open on a borrowed laptop must not be
     * able to lock its owner out.
     */
    it("refuses to reset your own", async () => {
      const response = await act(TEST_USERNAME, "password");

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ error: { code: "OWN_ACCOUNT" } });
      expect((await me(admin)).statusCode).toBe(200);
    });
  });

  describe("disabling an account", () => {
    it("says when it was disabled, and keeps the account in the list", async () => {
      const response = await act("partner", "disable");

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        account: { username: "partner", disabledAt: expect.any(String) },
      });
      expect((await accountOf("partner")).disabledAt).not.toBeNull();
    });

    it("signs them out everywhere", async () => {
      const phone = await api.login("partner", PARTNER_PASSWORD);

      await act("partner", "disable");

      // Counted before the phone is presented again: presenting a leftover
      // session of a disabled account deletes it, which would hide the
      // disable having skipped it.
      const left = await api.database.client.session.count({
        where: { user: { username: "partner" } },
      });
      expect(left).toBe(0);
      expect((await me(phone)).statusCode).toBe(401);
    });

    it("stops every machine token they issued, and only theirs", async () => {
      const theirs = await api.createMachineToken("partner-mcp", "read-write", undefined, "partner");
      const mine = await api.createMachineToken("dario-mcp", "read");

      await act("partner", "disable");

      const presented = async (token: string) =>
        (
          await api.app.inject({
            method: "GET",
            url: "/auth/me",
            headers: api.machineHeaders(token),
          })
        ).statusCode;
      expect(await presented(theirs)).toBe(401);
      expect(await presented(mine)).toBe(200);
      expect(await api.database.client.machineToken.count({ where: { name: "partner-mcp" } })).toBe(0);
    });

    it("keeps their inventory", async () => {
      const partner = await api.login("partner", PARTNER_PASSWORD);
      await api.app.inject({
        method: "POST",
        url: "/storage-units",
        headers: api.authHeaders(partner),
        payload: { parentId: null, name: "Partner's shed", kind: "ROOM", description: null },
      });

      await act("partner", "disable");

      expect(await api.database.client.storageUnit.count({ where: { name: "Partner's shed" } })).toBe(1);
    });

    /**
     * The same answer a wrong password gets — status, code and words — so the
     * sign-in screen does not tell anybody that this account exists.
     */
    it("refuses their password exactly as it refuses a wrong one", async () => {
      await act("partner", "disable");

      const disabled = await signIn("partner", PARTNER_PASSWORD);
      const wrong = await signIn(TEST_USERNAME, "not-the-password");

      expect(disabled.statusCode).toBe(wrong.statusCode);
      expect(disabled.json()).toEqual(wrong.json());
      expect(disabled.headers["www-authenticate"]).toBe(wrong.headers["www-authenticate"]);
    });

    it("counts those sign-ins against the limiter, as wrong passwords are counted", async () => {
      await act("partner", "disable");

      for (let attempt = 0; attempt < LOGIN_ATTEMPT_LIMIT; attempt += 1) {
        await signIn("partner", PARTNER_PASSWORD);
      }

      expect((await signIn("partner", PARTNER_PASSWORD)).statusCode).toBe(429);
    });

    it("refuses yourself, with a conflict of its own", async () => {
      await act("partner", "role", { role: "administrator" });

      const response = await act(TEST_USERNAME, "disable");

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ error: { code: "OWN_ACCOUNT" } });
      expect((await me(admin)).statusCode).toBe(200);
    });
  });

  describe("an account disabled with something left behind", () => {
    /**
     * A disable that stopped half way — the account marked, the sessions not
     * yet deleted — must still open nothing. Resolution reads the state; it
     * does not trust the deletions to have happened.
     */
    it("refuses a session that survived it", async () => {
      const phone = await api.login("partner", PARTNER_PASSWORD);
      await api.database.client.user.update({
        where: { username: "partner" },
        data: { disabledAt: new Date() },
      });

      const response = await me(phone);
      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ error: { code: "INVALID_SESSION" } });
    });

    it("refuses a machine token that survived it", async () => {
      const token = await api.createMachineToken("partner-mcp", "read", undefined, "partner");
      await api.database.client.user.update({
        where: { username: "partner" },
        data: { disabledAt: new Date() },
      });

      const response = await api.app.inject({
        method: "GET",
        url: "/storage-units",
        headers: api.machineHeaders(token),
      });
      expect(response.statusCode).toBe(401);
    });
  });

  describe("enabling it again", () => {
    it("lets them sign in again with the password they had", async () => {
      await act("partner", "disable");

      const response = await act("partner", "enable");

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ account: { disabledAt: null } });
      expect((await signIn("partner", PARTNER_PASSWORD)).statusCode).toBe(200);
    });

    it("does not bring back the machine tokens the disable revoked", async () => {
      const token = await api.createMachineToken("partner-mcp", "read", undefined, "partner");
      await act("partner", "disable");

      await act("partner", "enable");

      const response = await api.app.inject({
        method: "GET",
        url: "/auth/me",
        headers: api.machineHeaders(token),
      });
      expect(response.statusCode).toBe(401);
    });
  });

  describe("a passkey of a disabled account", () => {
    let phone: SoftwareAuthenticator;

    const addPasskeyFor = async (token: string): Promise<void> => {
      const started = (
        await api.app.inject({
          method: "POST",
          url: "/auth/passkeys/options",
          headers: api.authHeaders(token),
        })
      ).json() as {
        ceremonyId: string;
        options: Parameters<SoftwareAuthenticator["register"]>[0];
      };

      const added = await api.app.inject({
        method: "POST",
        url: "/auth/passkeys",
        headers: api.authHeaders(token),
        payload: {
          ceremonyId: started.ceremonyId,
          label: "Pixel 8",
          credential: phone.register(started.options),
        },
      });
      expect(added.statusCode).toBe(201);
    };

    const signInWithThePhone = async () => {
      const started = (
        await api.app.inject({ method: "POST", url: "/auth/passkey-login/options" })
      ).json() as {
        ceremonyId: string;
        options: Parameters<SoftwareAuthenticator["assert"]>[0];
      };

      return await api.app.inject({
        method: "POST",
        url: "/auth/passkey-login",
        payload: { ceremonyId: started.ceremonyId, credential: phone.assert(started.options) },
      });
    };

    beforeEach(async () => {
      phone = aSoftwareAuthenticator({
        origin: api.relyingParty.origin,
        rpId: api.relyingParty.id,
      });
      await addPasskeyFor(await api.login("partner", PARTNER_PASSWORD));
    });

    it("opens nothing, answered as a passkey that is not recognised", async () => {
      await act("partner", "disable");

      const response = await signInWithThePhone();

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ error: { code: "INVALID_PASSKEY" } });
    });

    it("is kept, and opens the account again once it is enabled (ADR 19)", async () => {
      await act("partner", "disable");
      await act("partner", "enable");

      expect((await signInWithThePhone()).statusCode).toBe(200);
    });

    it("is kept by a password reset", async () => {
      await reset("partner");

      expect((await signInWithThePhone()).statusCode).toBe(200);
    });
  });

  describe("who is refused", () => {
    it("refuses a person who is not an administrator, on every route, with 403", async () => {
      const partner = await api.login("partner", PARTNER_PASSWORD);
      const { id } = await accountOf(TEST_USERNAME);
      const headers = api.authHeaders(partner);

      const responses = await Promise.all([
        api.app.inject({ method: "GET", url: "/auth/accounts", headers }),
        api.app.inject({
          method: "POST",
          url: "/auth/accounts",
          headers,
          payload: { username: "child", role: "user" },
        }),
        api.app.inject({ method: "POST", url: `/auth/accounts/${id}/role`, headers, payload: { role: "user" } }),
        api.app.inject({ method: "POST", url: `/auth/accounts/${id}/password`, headers }),
        api.app.inject({ method: "POST", url: `/auth/accounts/${id}/disable`, headers }),
        api.app.inject({ method: "POST", url: `/auth/accounts/${id}/enable`, headers }),
      ]);

      for (const response of responses) {
        expect(response.statusCode).toBe(403);
        expect(response.json()).toMatchObject({ error: { code: "ADMINISTRATOR_ONLY" } });
      }
      expect((await accountOf(TEST_USERNAME)).role).toBe("administrator");
      expect((await list()).body).not.toContain('"child"');
      expect((await accountOf(TEST_USERNAME)).mustChangePassword).toBe(false);
    });

    it("refuses an administrator's read-write machine token, on every route, with 403", async () => {
      const token = await api.createMachineToken("dario-mcp", "read-write");
      const { id } = await accountOf("partner");
      const headers = api.machineHeaders(token);

      const responses = await Promise.all([
        api.app.inject({ method: "GET", url: "/auth/accounts", headers }),
        api.app.inject({
          method: "POST",
          url: "/auth/accounts",
          headers,
          payload: { username: "child", role: "user" },
        }),
        api.app.inject({ method: "POST", url: `/auth/accounts/${id}/role`, headers, payload: { role: "administrator" } }),
        api.app.inject({ method: "POST", url: `/auth/accounts/${id}/password`, headers }),
        api.app.inject({ method: "POST", url: `/auth/accounts/${id}/disable`, headers }),
        api.app.inject({ method: "POST", url: `/auth/accounts/${id}/enable`, headers }),
      ]);

      for (const response of responses) {
        expect(response.statusCode).toBe(403);
        expect(response.json()).toMatchObject({
          error: { code: "MACHINE_TOKEN_CANNOT_MANAGE_ACCOUNTS" },
        });
      }
      expect((await accountOf("partner")).role).toBe("user");
      expect((await signIn("partner", PARTNER_PASSWORD)).statusCode).toBe(200);
      expect((await list()).body).not.toContain('"child"');
    });

    it("refuses a read machine token the list too, which no scope hook stops", async () => {
      const token = await api.createMachineToken("dario-mcp", "read");

      const response = await api.app.inject({
        method: "GET",
        url: "/auth/accounts",
        headers: api.machineHeaders(token),
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        error: { code: "MACHINE_TOKEN_CANNOT_MANAGE_ACCOUNTS" },
      });
    });

    it("refuses a read machine token's writes with 403 before any of this is read", async () => {
      const token = await api.createMachineToken("dario-mcp", "read");

      const response = await create(
        { username: "child", role: "user" },
        api.machineHeaders(token),
      );

      expect(response.statusCode).toBe(403);
    });

    it("refuses without a session", async () => {
      const response = await api.app.inject({ method: "GET", url: "/auth/accounts" });

      expect(response.statusCode).toBe(401);
    });

    it("has no route that deletes an account", async () => {
      const { id } = await accountOf("partner");

      const response = await api.app.inject({
        method: "DELETE",
        url: `/auth/accounts/${id}`,
        headers: api.authHeaders(admin),
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
    });
  });
});
