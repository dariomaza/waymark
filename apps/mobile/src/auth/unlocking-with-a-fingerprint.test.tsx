import { aSession } from "@waymark/api-client/testing";

import { inMemorySecureStorage, type SecureStorage } from "./secure-storage.js";
import { SEALED_UNTIL_KEY, SESSION_KEY } from "./session-store.js";
import { LANGUAGE_KEY } from "../app/language.js";
import { API_URL, apiServer, http, HttpResponse } from "../testing/api-server.js";
import { fireEvent, renderApp, screen, waitFor } from "../testing/render-app.js";
import { theApiKnowsTheHouse } from "../testing/the-house.js";

/**
 * # The fingerprint is a second door, not a gate
 *
 * The token is sealed in the Android Keystore with the OS's own requirement
 * that somebody prove who they are before it can be READ (ADR 6 put it there;
 * this decides who may take it out). That is the strong version of this
 * feature: without the fingerprint the token cannot be decrypted at all, by
 * this app or by anything else on the phone. An app-level "ask for a
 * fingerprint, then carry on" is theatre by comparison — the bytes are
 * readable either way and the check is a branch anybody with the phone
 * unlocked can skip.
 *
 * What it is NOT is a way in that replaces the password. The password form is
 * always drawn, always usable, and never behind a link: a wet thumb, a cut
 * finger and a phone that has just rebooted are all ordinary Tuesdays, and
 * every one of them has to end with somebody inside their own inventory.
 */

const A_PROMPT = "Unlock your Waymark session";

const aLiveSealedSession = aSession({ token: "the-sealed-token" });

/**
 * A phone as it is the morning after somebody signed in: the token sealed
 * behind the keystore, and a note beside it — readable without proving
 * anything — that says a sealed session is there and when it stops being one.
 *
 * The note is what lets the login screen offer the door without opening it. A
 * screen that had to READ the token to find out whether there was one would
 * put a fingerprint prompt in front of the app on every cold start, which is
 * the gate this feature is deliberately not.
 */
const aPhoneHolding = (
  session = aLiveSealedSession,
  behaviour: {
    readonly canUnlock?: boolean;
    readonly answersThePrompt?: boolean;
  } = {},
): SecureStorage =>
  inMemorySecureStorage(
    { [LANGUAGE_KEY]: "en", [SEALED_UNTIL_KEY]: session.expiresAt },
    {
      sealed: { [SESSION_KEY]: JSON.stringify(session) },
      canUnlock: behaviour.canUnlock ?? true,
      answersThePrompt: behaviour.answersThePrompt ?? true,
    },
  );

/** Counts what the operating system was asked, without changing any of it. */
const counting = (
  storage: SecureStorage,
): { readonly storage: SecureStorage; readonly prompts: readonly string[] } => {
  const prompts: string[] = [];

  return {
    prompts,
    storage: {
      ...storage,
      unlock: async (key, prompt) => {
        prompts.push(prompt);

        return await storage.unlock(key, prompt);
      },
    },
  };
};

const theCamera = /scan a label/i;
const theDoor = "Sign in with a fingerprint";

describe("unlocking a sealed session with a fingerprint", () => {
  beforeEach(() => {
    theApiKnowsTheHouse();
  });

  describe("on a phone that can do it, holding a sealed session", () => {
    /**
     * It opens by itself, because the alternative is a screen that knows
     * perfectly well it could let somebody in and makes them ask first.
     */
    it("asks for the fingerprint on arrival and goes straight in", async () => {
      const { storage, prompts } = counting(aPhoneHolding());

      await renderApp({ screen: { name: "Tabs" }, storage });

      expect(await screen.findByText(theCamera)).toBeOnTheScreen();
      expect(prompts).toEqual([A_PROMPT]);
    });

    it("draws the password form and the fingerprint door together", async () => {
      const storage = aPhoneHolding(aLiveSealedSession, { answersThePrompt: false });

      await renderApp({ screen: { name: "Tabs" }, storage });

      expect(await screen.findByLabelText("Username")).toBeOnTheScreen();
      expect(screen.getByLabelText("Password")).toBeOnTheScreen();
      expect(screen.getByRole("button", { name: theDoor })).toBeOnTheScreen();
    });

    /**
     * The single most likely way to make this feature hated: a dialog that
     * reopens the moment you dismiss it. Cancelling is an ANSWER — it means
     * "not that way, this time" — and the only correct response to it is to
     * leave somebody alone in front of the form they can already use.
     */
    it("leaves somebody on the password form when they cancel, and does not ask again", async () => {
      const { storage, prompts } = counting(
        aPhoneHolding(aLiveSealedSession, { answersThePrompt: false }),
      );

      await renderApp({ screen: { name: "Tabs" }, storage });

      await waitFor(() => {
        expect(prompts).toHaveLength(1);
      });

      await fireEvent.changeText(await screen.findByLabelText("Username"), "dario");

      expect(prompts).toHaveLength(1);
      expect(screen.queryByText(theCamera)).toBeNull();
    });

    /** Cancelling must not be the end of the road either. */
    it("still signs in with the password after a cancelled prompt", async () => {
      apiServer.use(
        http.post(`${API_URL}/auth/login`, () =>
          HttpResponse.json({
            token: "a-fresh-token",
            expiresAt: "2099-01-01T00:00:00.000Z",
            user: { id: "u1", username: "dario" },
          }),
        ),
      );
      const storage = aPhoneHolding(aLiveSealedSession, { answersThePrompt: false });

      await renderApp({ screen: { name: "Tabs" }, storage });

      await fireEvent.changeText(await screen.findByLabelText("Username"), "dario");
      await fireEvent.changeText(screen.getByLabelText("Password"), "correct horse");
      await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));

      expect(await screen.findByText(theCamera)).toBeOnTheScreen();
    });

    /** The door stays open for somebody who dismissed it and changed their mind. */
    it("asks again when the door itself is pressed", async () => {
      const phone = aPhoneHolding(aLiveSealedSession, { answersThePrompt: false });
      let willAnswer = false;
      const prompts: string[] = [];
      const storage: SecureStorage = {
        ...phone,
        unlock: async (key, prompt) => {
          prompts.push(prompt);

          return willAnswer
            ? JSON.stringify(aLiveSealedSession)
            : await phone.unlock(key, prompt);
        },
      };

      await renderApp({ screen: { name: "Tabs" }, storage });

      const door = await screen.findByRole("button", { name: theDoor });
      willAnswer = true;
      await fireEvent.press(door);

      expect(await screen.findByText(theCamera)).toBeOnTheScreen();
      expect(prompts).toHaveLength(2);
    });
  });

  /**
   * # The three ways this cannot work, and the one place they all end
   *
   * No hardware, hardware with nothing enrolled, and a prompt somebody
   * dismissed. The first two are indistinguishable through this API —
   * `canUseBiometricAuthentication()` answers `false` to both — and it does not
   * matter, because the right behaviour is identical: do not offer a door that
   * cannot open. Offering it and failing on the press is worse than never
   * offering it, and neither may be the reason somebody cannot reach their own
   * inventory.
   */
  describe("on a phone that cannot do it", () => {
    it("offers no door and asks nothing, with the password form working", async () => {
      apiServer.use(
        http.post(`${API_URL}/auth/login`, () =>
          HttpResponse.json({
            token: "a-fresh-token",
            expiresAt: "2099-01-01T00:00:00.000Z",
            user: { id: "u1", username: "dario" },
          }),
        ),
      );
      const { storage, prompts } = counting(
        aPhoneHolding(aLiveSealedSession, { canUnlock: false }),
      );

      await renderApp({ screen: { name: "Tabs" }, storage });

      await fireEvent.changeText(await screen.findByLabelText("Username"), "dario");
      expect(screen.queryByRole("button", { name: theDoor })).toBeNull();
      expect(prompts).toEqual([]);

      await fireEvent.changeText(screen.getByLabelText("Password"), "correct horse");
      await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));

      expect(await screen.findByText(theCamera)).toBeOnTheScreen();
    });
  });

  describe("when there is nothing to unlock", () => {
    it("offers no door on a phone that has never signed in", async () => {
      const { storage, prompts } = counting(
        inMemorySecureStorage({ [LANGUAGE_KEY]: "en" }, { canUnlock: true }),
      );

      await renderApp({ screen: { name: "Tabs" }, storage });

      await screen.findByLabelText("Username");

      expect(screen.queryByRole("button", { name: theDoor })).toBeNull();
      expect(prompts).toEqual([]);
    });

    /**
     * A session that ran out is not a session (ADR 6). Unsealing one would
     * spend a fingerprint to arrive at the login screen anyway.
     */
    it("offers no door for a session that expired while the phone was in a drawer", async () => {
      const { storage, prompts } = counting(
        aPhoneHolding(aSession({ expiresAt: "2020-01-01T00:00:00.000Z" })),
      );

      await renderApp({ screen: { name: "Tabs" }, storage });

      await screen.findByLabelText("Username");

      expect(screen.queryByRole("button", { name: theDoor })).toBeNull();
      expect(prompts).toEqual([]);
    });

    /**
     * Android invalidates a key when the enrolled biometrics change, and a read
     * of it answers `null` rather than failing. A new fingerprint on the phone
     * therefore means the old session is gone for good — so the note beside it
     * goes too, and the door stops being offered rather than being offered
     * for ever and never opening.
     */
    it("stops offering the door once the keystore says the key is gone", async () => {
      const phone = aPhoneHolding();
      const storage: SecureStorage = { ...phone, unlock: async () => null };

      await renderApp({ screen: { name: "Tabs" }, storage });

      await screen.findByLabelText("Username");

      await waitFor(() => {
        expect(screen.queryByRole("button", { name: theDoor })).toBeNull();
      });
      expect(await storage.read(SEALED_UNTIL_KEY)).toBeNull();
    });
  });

  describe("what signing in leaves behind", () => {
    /**
     * The seal is written only on a phone that can stand behind it. Sealing a
     * token on a phone with no enrolled biometric would write a value nothing
     * on that device can ever decrypt — which is not security, it is throwing
     * the session away and calling it strong.
     */
    it("seals the token on a phone that can, and leaves a note that one is there", async () => {
      apiServer.use(
        http.post(`${API_URL}/auth/login`, () =>
          HttpResponse.json({
            token: "a-fresh-token",
            expiresAt: "2099-01-01T00:00:00.000Z",
            user: { id: "u1", username: "dario" },
          }),
        ),
      );
      const storage = inMemorySecureStorage({ [LANGUAGE_KEY]: "en" }, { canUnlock: true });

      await renderApp({ screen: { name: "Tabs" }, storage });

      await fireEvent.changeText(await screen.findByLabelText("Username"), "dario");
      await fireEvent.changeText(screen.getByLabelText("Password"), "correct horse");
      await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));

      await screen.findByText(theCamera);

      await waitFor(async () => {
        expect(await storage.unlock(SESSION_KEY, A_PROMPT)).toContain("a-fresh-token");
      });
      expect(await storage.read(SEALED_UNTIL_KEY)).toBe("2099-01-01T00:00:00.000Z");
      // And not in the clear beside it.
      expect(await storage.read(SESSION_KEY)).toBeNull();
    });

    /**
     * A phone with no biometric keeps exactly the behaviour it had before this
     * feature existed: the token in the keystore, encrypted, and the app opens
     * on the inventory rather than on a password. Making those people type a
     * password every launch would be this feature charging them for something
     * it cannot give them.
     */
    it("keeps the token readable on a phone that cannot seal it, and opens straight in", async () => {
      apiServer.use(
        http.post(`${API_URL}/auth/login`, () =>
          HttpResponse.json({
            token: "a-fresh-token",
            expiresAt: "2099-01-01T00:00:00.000Z",
            user: { id: "u1", username: "dario" },
          }),
        ),
      );
      const storage = inMemorySecureStorage({ [LANGUAGE_KEY]: "en" }, { canUnlock: false });

      await renderApp({ screen: { name: "Tabs" }, storage });

      await fireEvent.changeText(await screen.findByLabelText("Username"), "dario");
      await fireEvent.changeText(screen.getByLabelText("Password"), "correct horse");
      await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));

      await screen.findByText(theCamera);

      await waitFor(async () => {
        expect(await storage.read(SESSION_KEY)).toContain("a-fresh-token");
      });
      expect(await storage.read(SEALED_UNTIL_KEY)).toBeNull();
    });
  });

  describe("in Spanish", () => {
    it("names the door in the language on screen", async () => {
      const storage = inMemorySecureStorage(
        { [LANGUAGE_KEY]: "es", [SEALED_UNTIL_KEY]: aLiveSealedSession.expiresAt },
        {
          sealed: { [SESSION_KEY]: JSON.stringify(aLiveSealedSession) },
          canUnlock: true,
          answersThePrompt: false,
        },
      );

      await renderApp({ screen: { name: "Tabs" }, storage });

      expect(
        await screen.findByRole("button", { name: "Iniciar sesión con la huella" }),
      ).toBeOnTheScreen();
    });
  });
});
