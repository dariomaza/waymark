import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  aSoftwareAuthenticator,
  type SoftwareAuthenticator,
} from "../auth/testing/software-authenticator.js";
import {
  TEST_PASSWORD,
  TEST_USERNAME,
  createTestApi,
  type TestApi,
} from "./testing/test-api.js";

/**
 * # A passkey over HTTP, from a browser that does not exist
 *
 * Every byte in these cases is real: a P-256 key pair signs real CBOR and
 * `@simplewebauthn/server` judges it, through a real Fastify instance in front
 * of real Prisma repositories on a real SQLite file. What is standing in for a
 * phone is `auth/testing/software-authenticator.ts`, and what that can and
 * cannot tell us is written there.
 *
 * ## The rule this file exists to hold down
 *
 * A passkey is an ADDITIONAL door (ADR 19). `POST /auth/login` is untouched by
 * all of this, and there is a case here that says so — because the day
 * somebody "simplifies" the sign-in screen, the thing that has to fail is a
 * test and not a person standing in a garage with a wet thumb.
 */
describe("passkeys over HTTP", () => {
  let api: TestApi;
  let session: string;
  let phone: SoftwareAuthenticator;

  beforeAll(async () => {
    api = await createTestApi();
  });

  afterAll(async () => {
    await api.destroy();
  });

  beforeEach(async () => {
    await api.reset();
    await api.createUser(TEST_USERNAME, TEST_PASSWORD);
    session = await api.login();
    phone = aSoftwareAuthenticator({
      origin: api.relyingParty.origin,
      rpId: api.relyingParty.id,
    });
  });

  const registrationOptions = async (token = session) =>
    await api.app.inject({
      method: "POST",
      url: "/auth/passkeys/options",
      headers: api.authHeaders(token),
    });

  const addPasskey = async (
    label = "Pixel 8",
    authenticator: SoftwareAuthenticator = phone,
    token = session,
  ) => {
    const started = (await registrationOptions(token)).json() as {
      ceremonyId: string;
      options: Parameters<SoftwareAuthenticator["register"]>[0];
    };

    return await api.app.inject({
      method: "POST",
      url: "/auth/passkeys",
      headers: api.authHeaders(token),
      payload: {
        ceremonyId: started.ceremonyId,
        label,
        credential: authenticator.register(started.options),
      },
    });
  };

  const signInWith = async (authenticator: SoftwareAuthenticator = phone) => {
    const started = (
      await api.app.inject({
        method: "POST",
        url: "/auth/passkey-login/options",
      })
    ).json() as {
      ceremonyId: string;
      options: Parameters<SoftwareAuthenticator["assert"]>[0];
    };

    return await api.app.inject({
      method: "POST",
      url: "/auth/passkey-login",
      payload: {
        ceremonyId: started.ceremonyId,
        credential: authenticator.assert(started.options),
      },
    });
  };

  describe("adding one", () => {
    it("hands the browser a ceremony and the options for it", async () => {
      const response = await registrationOptions();

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        ceremonyId: expect.any(String),
        options: { rp: { id: api.relyingParty.id, name: "Waymark" } },
      });
    });

    it("answers 201 with the device it registered", async () => {
      const response = await addPasskey("Pixel 8");

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({
        passkey: {
          id: expect.any(String),
          label: "Pixel 8",
          createdAt: expect.any(String),
          lastUsedAt: null,
        },
      });
    });

    /**
     * The public key is not a secret, and it is still not this response's
     * business: nothing on a screen has a use for it, and neither the
     * credential id nor the counter says anything a person is deciding with.
     */
    it("never answers with the key, the credential id or the counter", async () => {
      const response = await addPasskey();

      expect(response.body).not.toMatch(/publicKey|credentialId|signCount/u);
    });

    it("refuses without a session at all", async () => {
      const response = await api.app.inject({
        method: "POST",
        url: "/auth/passkeys/options",
      });

      expect(response.statusCode).toBe(401);
    });

    it("refuses a name that is only spaces, and says which field", async () => {
      const started = (await registrationOptions()).json() as {
        ceremonyId: string;
        options: Parameters<SoftwareAuthenticator["register"]>[0];
      };

      const response = await api.app.inject({
        method: "POST",
        url: "/auth/passkeys",
        headers: api.authHeaders(session),
        payload: {
          ceremonyId: started.ceremonyId,
          label: "   ",
          credential: phone.register(started.options),
        },
      });

      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({
        error: { code: "INVALID_PASSKEY_LABEL" },
      });
    });

    it("refuses a ceremony that was never issued", async () => {
      const started = (await registrationOptions()).json() as {
        ceremonyId: string;
        options: Parameters<SoftwareAuthenticator["register"]>[0];
      };

      const response = await api.app.inject({
        method: "POST",
        url: "/auth/passkeys",
        headers: api.authHeaders(session),
        payload: {
          ceremonyId: "never-issued",
          label: "Pixel 8",
          credential: phone.register(started.options),
        },
      });

      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({
        error: { code: "PASSKEY_CEREMONY_EXPIRED" },
      });
    });

    it("refuses a device already registered", async () => {
      await addPasskey("Pixel 8");

      const response = await addPasskey("Pixel 8 again");

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({
        error: { code: "PASSKEY_ALREADY_REGISTERED" },
      });
    });
  });

  /**
   * # Adding a passkey needs the password (ADR 19)
   *
   * The same sentence ADR 18 makes about a machine token that could mint a
   * machine token: a credential able to issue its own successor outlives every
   * password change made to stop it. A session opened with a thumb may look at
   * the list and may remove from it; it may not add.
   */
  describe("and the session it takes to add one", () => {
    it("refuses a session a passkey opened", async () => {
      await addPasskey();
      const passkeySession = (await signInWith()).json() as { token: string };

      const response = await registrationOptions(passkeySession.token);

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        error: { code: "PASSKEY_NEEDS_A_PASSWORD" },
      });
    });

    /**
     * The refusal is on BOTH halves, not only on the one that hands out
     * options — otherwise a client that kept a ceremony from a password
     * session could finish it from a passkey one much later.
     */
    it("refuses the finish too, not only the options", async () => {
      await addPasskey();
      const passkeySession = (await signInWith()).json() as { token: string };
      const laptop = aSoftwareAuthenticator({
        origin: api.relyingParty.origin,
        rpId: api.relyingParty.id,
      });
      const started = (await registrationOptions()).json() as {
        ceremonyId: string;
        options: Parameters<SoftwareAuthenticator["register"]>[0];
      };

      const response = await api.app.inject({
        method: "POST",
        url: "/auth/passkeys",
        headers: api.authHeaders(passkeySession.token),
        payload: {
          ceremonyId: started.ceremonyId,
          label: "Work laptop",
          credential: laptop.register(started.options),
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it("lets a password-backed session add a second device", async () => {
      await addPasskey("Pixel 8");
      const laptop = aSoftwareAuthenticator({
        origin: api.relyingParty.origin,
        rpId: api.relyingParty.id,
      });

      const response = await addPasskey("Work laptop", laptop);

      expect(response.statusCode).toBe(201);
    });

    /**
     * Minting is hard and revoking is easy, and the asymmetry is the point:
     * somebody who thinks a device has been stolen is signed in on their
     * phone, not at a keyboard with their password to hand.
     */
    it("lets a passkey-opened session look at the list", async () => {
      await addPasskey();
      const passkeySession = (await signInWith()).json() as { token: string };

      const response = await api.app.inject({
        method: "GET",
        url: "/auth/passkeys",
        headers: api.authHeaders(passkeySession.token),
      });

      expect(response.statusCode).toBe(200);
    });

    it("lets a passkey-opened session remove one", async () => {
      const added = (await addPasskey()).json() as { passkey: { id: string } };
      const passkeySession = (await signInWith()).json() as { token: string };

      const response = await api.app.inject({
        method: "DELETE",
        url: `/auth/passkeys/${added.passkey.id}`,
        headers: api.authHeaders(passkeySession.token),
      });

      expect(response.statusCode).toBe(204);
    });
  });

  describe("signing in with one", () => {
    it("asks for no username, and tells an anonymous caller nothing", async () => {
      const response = await api.app.inject({
        method: "POST",
        url: "/auth/passkey-login/options",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        options: { allowCredentials: [], userVerification: "required" },
      });
    });

    /**
     * ADR 6: one mechanism. The body is the shape `POST /auth/login` answers,
     * so the clients read one thing and neither of them learns a second kind
     * of session.
     */
    it("answers exactly what a password answers", async () => {
      await addPasskey();

      const response = await signInWith();

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        token: expect.any(String),
        expiresAt: expect.any(String),
        user: { id: expect.any(String), username: TEST_USERNAME },
      });
    });

    it("hands back a session the rest of the API accepts", async () => {
      await addPasskey();
      const { token } = (await signInWith()).json() as { token: string };

      const response = await api.app.inject({
        method: "GET",
        url: "/storage-units",
        headers: api.authHeaders(token),
      });

      expect(response.statusCode).toBe(200);
    });

    it("refuses a credential nobody registered", async () => {
      const stranger = aSoftwareAuthenticator({
        origin: api.relyingParty.origin,
        rpId: api.relyingParty.id,
      });

      const response = await signInWith(stranger);

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ error: { code: "INVALID_PASSKEY" } });
    });

    it("refuses a ceremony that was never issued", async () => {
      await addPasskey();
      const started = (
        await api.app.inject({ method: "POST", url: "/auth/passkey-login/options" })
      ).json() as {
        ceremonyId: string;
        options: Parameters<SoftwareAuthenticator["assert"]>[0];
      };

      const response = await api.app.inject({
        method: "POST",
        url: "/auth/passkey-login",
        payload: {
          ceremonyId: "never-issued",
          credential: phone.assert(started.options),
        },
      });

      expect(response.statusCode).toBe(422);
    });

    it("refuses the same assertion sent twice", async () => {
      await addPasskey();
      const started = (
        await api.app.inject({ method: "POST", url: "/auth/passkey-login/options" })
      ).json() as {
        ceremonyId: string;
        options: Parameters<SoftwareAuthenticator["assert"]>[0];
      };
      const credential = phone.assert(started.options);

      const first = await api.app.inject({
        method: "POST",
        url: "/auth/passkey-login",
        payload: { ceremonyId: started.ceremonyId, credential },
      });
      const second = await api.app.inject({
        method: "POST",
        url: "/auth/passkey-login",
        payload: { ceremonyId: started.ceremonyId, credential },
      });

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(422);
    });

    /**
     * The rule that outranks the rest. A passkey is an additional door.
     */
    it("leaves the password working, always", async () => {
      await addPasskey();
      await signInWith();

      const response = await api.app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { username: TEST_USERNAME, password: TEST_PASSWORD },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe("the list, and removing one", () => {
    it("is empty before anything is registered", async () => {
      const response = await api.app.inject({
        method: "GET",
        url: "/auth/passkeys",
        headers: api.authHeaders(session),
      });

      expect(response.json()).toEqual({ passkeys: [] });
    });

    it("names each device and when it was last used", async () => {
      await addPasskey("Pixel 8");
      await signInWith();

      const { passkeys } = (
        await api.app.inject({
          method: "GET",
          url: "/auth/passkeys",
          headers: api.authHeaders(session),
        })
      ).json() as { passkeys: { label: string; lastUsedAt: string | null }[] };

      expect(passkeys).toHaveLength(1);
      expect(passkeys[0]?.label).toBe("Pixel 8");
      expect(passkeys[0]?.lastUsedAt).not.toBeNull();
    });

    it("removes one at a time and answers 204", async () => {
      const added = (await addPasskey()).json() as { passkey: { id: string } };

      const response = await api.app.inject({
        method: "DELETE",
        url: `/auth/passkeys/${added.passkey.id}`,
        headers: api.authHeaders(session),
      });

      expect(response.statusCode).toBe(204);
    });

    it("refuses an id that is not on this account", async () => {
      const response = await api.app.inject({
        method: "DELETE",
        url: "/auth/passkeys/never-existed",
        headers: api.authHeaders(session),
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({
        error: { code: "PASSKEY_NOT_FOUND" },
      });
    });

    it("stops that device signing in", async () => {
      const added = (await addPasskey()).json() as { passkey: { id: string } };
      await api.app.inject({
        method: "DELETE",
        url: `/auth/passkeys/${added.passkey.id}`,
        headers: api.authHeaders(session),
      });

      expect((await signInWith()).statusCode).toBe(401);
    });

    /**
     * ADR 19: there is no "you must keep one" rule, because there is no state
     * in which a passkey is the only way in. Removing the last one leaves the
     * password, which is what the sign-in screen is built around.
     */
    it("lets somebody remove the last one and sign in with their password", async () => {
      const added = (await addPasskey()).json() as { passkey: { id: string } };

      const removal = await api.app.inject({
        method: "DELETE",
        url: `/auth/passkeys/${added.passkey.id}`,
        headers: api.authHeaders(session),
      });
      const login = await api.app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { username: TEST_USERNAME, password: TEST_PASSWORD },
      });

      expect(removal.statusCode).toBe(204);
      expect(login.statusCode).toBe(200);
    });
  });

  /**
   * # A machine token may do none of this
   *
   * The same refusal `POST /auth/logout` and the machine-token routes already
   * make, extended for one more reason: a passkey is a person's thumb, and a
   * program has neither a thumb nor a reason to enumerate somebody's devices.
   */
  describe("a machine token", () => {
    it("is refused the list, which no scope hook would have caught", async () => {
      const token = await api.createMachineToken("mcp-server", "read");

      const response = await api.app.inject({
        method: "GET",
        url: "/auth/passkeys",
        headers: api.machineHeaders(token),
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        error: { code: "MACHINE_TOKEN_HAS_NO_PASSKEYS" },
      });
    });

    it("is refused a registration, even holding a read-write key", async () => {
      const token = await api.createMachineToken("filer", "read-write");

      const response = await api.app.inject({
        method: "POST",
        url: "/auth/passkeys/options",
        headers: api.machineHeaders(token),
      });

      expect(response.statusCode).toBe(403);
    });

    it("is refused a removal", async () => {
      const token = await api.createMachineToken("filer", "read-write");

      const response = await api.app.inject({
        method: "DELETE",
        url: "/auth/passkeys/anything",
        headers: api.machineHeaders(token),
      });

      expect(response.statusCode).toBe(403);
    });
  });
});
