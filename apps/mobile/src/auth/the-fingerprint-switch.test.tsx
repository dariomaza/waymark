import { aSession } from "@waymark/api-client/testing";

import { inMemorySecureStorage, type SecureStorage } from "./secure-storage.js";
import { SEALED_UNTIL_KEY, SESSION_KEY } from "./session-store.js";
import { LANGUAGE_KEY } from "../app/language.js";
import { API_URL, apiServer, http, HttpResponse } from "../testing/api-server.js";
import {
  act,
  fireEvent,
  relaunchApp,
  renderApp,
  screen,
  waitFor,
} from "../testing/render-app.js";
import { theApiKnowsTheHouse } from "../testing/the-house.js";

/**
 * # The fingerprint is a setting now, not a decision taken once behind a prompt
 *
 * It used to be sealed IMPLICITLY: signing in raised the system's prompt with
 * no warning, and dismissing it meant this phone never offered a fingerprint
 * again until the next sign-out and sign-in. One dismissed dialog, at the
 * worst possible moment, and the feature was gone with nowhere to bring it
 * back from.
 *
 * So the account screen carries a switch. It is the same seal underneath —
 * the token behind a Keystore key the OS will not decrypt without a
 * fingerprint — and what changes is that turning it on and turning it off are
 * both things somebody DOES, on purpose, after being told what each one
 * costs.
 *
 * ## The switch reads the phone, not a remembered preference
 *
 * There is no "biometrics enabled" flag anywhere. What the switch draws is
 * whether this phone is HOLDING a sealed session right now, which is the same
 * fact the sign-in screen draws its door from. A preference stored beside the
 * keystore would be a second answer to one question, and the two disagree the
 * first time a seal fails.
 */

const theCamera = /scan a label/i;
const theAvatar = "You, signed in as dario";
const theDoor = "Sign in with a fingerprint";
const THE_SWITCH = "Unlock with a fingerprint";
const TURN_ON = "Turn it on";
const TURN_OFF = "Turn it off";

const A_SEAL_PROMPT = "Confirm it is you, so this phone can remember your Waymark session";
const AN_UNLOCK_PROMPT = "Unlock your Waymark session";

const theSession = aSession({ token: "the-remembered-token" });

/**
 * A phone that CAN seal and is not sealing anything: a session in the clear,
 * which is what somebody has after dismissing the prompt at sign-in, or after
 * enrolling a fingerprint on a phone that signed in without one.
 */
const aPhoneHoldingAnUnsealedSession = (
  behaviour: { readonly answersThePrompt?: boolean } = {},
): SecureStorage =>
  inMemorySecureStorage(
    { [LANGUAGE_KEY]: "en", [SESSION_KEY]: JSON.stringify(theSession) },
    { canUnlock: true, answersThePrompt: behaviour.answersThePrompt ?? true },
  );

/**
 * A phone as it is the morning after somebody turned the switch on: the token
 * sealed, and the readable note beside it saying so.
 */
const aPhoneHoldingASealedSession = (
  language: "en" | "es" = "en",
): SecureStorage =>
  inMemorySecureStorage(
    { [LANGUAGE_KEY]: language, [SEALED_UNTIL_KEY]: theSession.expiresAt },
    { sealed: { [SESSION_KEY]: JSON.stringify(theSession) }, canUnlock: true },
  );

/**
 * Every sentence the operating system was asked to put on screen, in order.
 *
 * Both halves of the prompt are counted — sealing raises one on Android just
 * as unlocking does — because the claim worth proving about turning the
 * switch OFF is that it asks for nothing at all.
 */
const watching = (
  storage: SecureStorage,
): { readonly storage: SecureStorage; readonly prompts: readonly string[] } => {
  const prompts: string[] = [];

  return {
    prompts,
    storage: {
      ...storage,
      seal: async (key, value, prompt) => {
        prompts.push(prompt);

        await storage.seal(key, value, prompt);
      },
      unlock: async (key, prompt) => {
        prompts.push(prompt);

        return await storage.unlock(key, prompt);
      },
    },
  };
};

const openTheAccountScreen = async (named = theAvatar): Promise<void> => {
  await fireEvent.press(await screen.findByRole("button", { name: named }));
};

describe("turning the fingerprint on and off", () => {
  beforeEach(() => {
    theApiKnowsTheHouse();
  });

  describe("on a phone that can do it", () => {
    /**
     * The direction that gives something back. The prompt here is expected,
     * because the person pressed the thing that says it is coming.
     */
    it("turns the fingerprint on, and the next launch opens without a password", async () => {
      const { storage, prompts } = watching(aPhoneHoldingAnUnsealedSession());

      await renderApp({ screen: { name: "Tabs" }, storage });
      await screen.findByText(theCamera);
      await openTheAccountScreen();

      expect(
        await screen.findByRole("switch", { name: THE_SWITCH, checked: false }),
      ).toBeOnTheScreen();

      await fireEvent.press(screen.getByRole("switch", { name: THE_SWITCH }));
      await fireEvent.press(await screen.findByRole("button", { name: TURN_ON }));

      await waitFor(async () => {
        expect(await storage.read(SEALED_UNTIL_KEY)).toBe(theSession.expiresAt);
      });
      expect(prompts).toEqual([A_SEAL_PROMPT]);
      // Sealed, and no readable copy beside it — a token anything can read
      // makes the seal decoration.
      expect(await storage.unlock(SESSION_KEY, A_SEAL_PROMPT)).toContain(
        "the-remembered-token",
      );
      expect(await storage.read(SESSION_KEY)).toBeNull();

      await relaunchApp({ screen: { name: "Tabs" }, storage });

      expect(await screen.findByText(theCamera)).toBeOnTheScreen();
    });

    it("says so on the switch once it is on", async () => {
      const storage = aPhoneHoldingASealedSession();

      await renderApp({ screen: { name: "Tabs" }, storage });
      await screen.findByText(theCamera);
      await openTheAccountScreen();

      expect(
        await screen.findByRole("switch", { name: THE_SWITCH, checked: true }),
      ).toBeOnTheScreen();
    });

    /**
     * # The switch reports, it does not predict
     *
     * The system's prompt is on screen for as long as somebody takes to
     * decide, and for that whole time a switch already reading ON would be
     * saying the answer back to them before they had given it — and would be
     * simply wrong if they said no.
     *
     * So it flips when the keystore has answered and not when the button was
     * pressed. That is the same rule the flag follows everywhere else in the
     * store, at the one moment it is visible.
     */
    it("does not flip until the phone has answered the prompt", async () => {
      const phone = aPhoneHoldingAnUnsealedSession();
      let letTheSealFinish = (): void => undefined;
      const storage: SecureStorage = {
        ...phone,
        seal: async (key, value, prompt) => {
          await new Promise<void>((resolve) => {
            letTheSealFinish = resolve;
          });
          await phone.seal(key, value, prompt);
        },
      };

      await renderApp({ screen: { name: "Tabs" }, storage });
      await screen.findByText(theCamera);
      await openTheAccountScreen();

      await fireEvent.press(await screen.findByRole("switch", { name: THE_SWITCH }));
      await fireEvent.press(await screen.findByRole("button", { name: TURN_ON }));

      /*
       * The prompt is up and nothing has been sealed, so neither has anything
       * been claimed.
       *
       * `includeHiddenElements`, because the sheet is a MODAL: while it is
       * open the row behind it is out of the accessibility tree, and it is
       * still drawn on the screen behind the sheet where somebody can read
       * it. What is being asserted is what that person sees.
       */
      expect(
        screen.getByRole("switch", {
          name: THE_SWITCH,
          checked: false,
          includeHiddenElements: true,
        }),
      ).toBeOnTheScreen();

      await act(async () => {
        letTheSealFinish();
      });

      expect(
        await screen.findByRole("switch", { name: THE_SWITCH, checked: true }),
      ).toBeOnTheScreen();
    });

    /**
     * The consequential direction. Nothing is sealed afterwards and nothing is
     * left in the clear either, so the sign-in screen has no door to offer and
     * the next launch is a password — which is exactly what the confirmation
     * said would happen.
     */
    it("turns the fingerprint off, and the sign-in screen stops offering it", async () => {
      const storage = aPhoneHoldingASealedSession();

      await renderApp({ screen: { name: "Tabs" }, storage });
      await screen.findByText(theCamera);
      await openTheAccountScreen();

      await fireEvent.press(await screen.findByRole("switch", { name: THE_SWITCH }));
      await fireEvent.press(await screen.findByRole("button", { name: TURN_OFF }));

      await waitFor(async () => {
        expect(await storage.read(SEALED_UNTIL_KEY)).toBeNull();
      });
      expect(await storage.unlock(SESSION_KEY, AN_UNLOCK_PROMPT)).toBeNull();
      expect(await storage.read(SESSION_KEY)).toBeNull();

      const next = watching(storage);
      await relaunchApp({ screen: { name: "Tabs" }, storage: next.storage });

      expect(await screen.findByLabelText("Username")).toBeOnTheScreen();
      expect(screen.queryByRole("button", { name: theDoor })).toBeNull();
      expect(next.prompts).toEqual([]);
    });

    /** Turning it off must not throw somebody out of the app they are in. */
    it("leaves the session it is holding alone when it is turned off", async () => {
      const storage = aPhoneHoldingASealedSession();

      await renderApp({ screen: { name: "Tabs" }, storage });
      await screen.findByText(theCamera);
      await openTheAccountScreen();

      await fireEvent.press(await screen.findByRole("switch", { name: THE_SWITCH }));
      await fireEvent.press(await screen.findByRole("button", { name: TURN_OFF }));

      expect(
        await screen.findByRole("switch", { name: THE_SWITCH, checked: false }),
      ).toBeOnTheScreen();
      expect(screen.getByText("Signed in as dario")).toBeOnTheScreen();
    });

    /**
     * Deleting a sealed entry removes the bytes rather than decrypting them,
     * so the one direction that takes something away is also the one that
     * asks for nothing — which matters on the day somebody's sensor is the
     * reason they want it gone.
     */
    it("asks for no fingerprint to turn it off", async () => {
      const { storage, prompts } = watching(aPhoneHoldingASealedSession());

      await renderApp({ screen: { name: "Tabs" }, storage });
      await screen.findByText(theCamera);
      await openTheAccountScreen();

      await fireEvent.press(await screen.findByRole("switch", { name: THE_SWITCH }));
      await fireEvent.press(await screen.findByRole("button", { name: TURN_OFF }));

      await waitFor(async () => {
        expect(await storage.read(SEALED_UNTIL_KEY)).toBeNull();
      });
      expect(prompts).toEqual([AN_UNLOCK_PROMPT]);
    });

    /**
     * Both directions ask first. A switch that acted on the touch would make
     * the OFF direction a thumb's width away from signing somebody out of
     * their own phone next Tuesday.
     */
    it("says what stops working before it turns it off", async () => {
      const storage = aPhoneHoldingASealedSession();

      await renderApp({ screen: { name: "Tabs" }, storage });
      await screen.findByText(theCamera);
      await openTheAccountScreen();

      await fireEvent.press(await screen.findByRole("switch", { name: THE_SWITCH }));

      expect(
        await screen.findByText(
          /you will type your password the next time you open Waymark/i,
        ),
      ).toBeOnTheScreen();
    });

    it("changes nothing when the question is dismissed", async () => {
      const { storage, prompts } = watching(aPhoneHoldingASealedSession());

      await renderApp({ screen: { name: "Tabs" }, storage });
      await screen.findByText(theCamera);
      await openTheAccountScreen();

      await fireEvent.press(await screen.findByRole("switch", { name: THE_SWITCH }));
      await fireEvent.press(await screen.findByRole("button", { name: "Close" }));

      expect(
        await screen.findByRole("switch", { name: THE_SWITCH, checked: true }),
      ).toBeOnTheScreen();
      expect(await storage.read(SEALED_UNTIL_KEY)).toBe(theSession.expiresAt);
      expect(prompts).toEqual([AN_UNLOCK_PROMPT]);
    });
  });

  /**
   * The same argument the sign-in screen already makes about its button: no
   * sensor, nothing enrolled and no screen lock are one answer through this
   * API, and a control that fails the moment it is touched is worse than no
   * control at all.
   */
  describe("on a phone that cannot do it", () => {
    it("draws no switch at all", async () => {
      const storage = inMemorySecureStorage(
        { [LANGUAGE_KEY]: "en", [SESSION_KEY]: JSON.stringify(theSession) },
        { canUnlock: false },
      );

      await renderApp({ screen: { name: "Tabs" }, storage });
      await screen.findByText(theCamera);
      await openTheAccountScreen();

      expect(await screen.findByText("Signed in as dario")).toBeOnTheScreen();
      expect(screen.queryByRole("switch", { name: THE_SWITCH })).toBeNull();
    });
  });

  /**
   * # The switch may never claim a door the keystore does not have
   *
   * The flag the switch draws is a REPORT of what the keystore did, never a
   * prediction of what it is about to do. It goes true once the seal, the
   * note beside it and the removal of the readable copy have all resolved,
   * and any failure along the way rolls the phone back to the unsealed shape.
   *
   * Both of these were reachable before the switch existed and neither was
   * visible: the state claimed a seal that had been refused, and it withdrew
   * the note from a seal that had succeeded.
   */
  describe("when the keystore does not go through with it", () => {
    const signInWithAPassword = async (): Promise<void> => {
      apiServer.use(
        http.post(`${API_URL}/auth/login`, () =>
          HttpResponse.json({
            token: "a-fresh-token",
            expiresAt: "2099-01-01T00:00:00.000Z",
            user: { id: "u1", username: "dario" },
          }),
        ),
      );

      await fireEvent.changeText(await screen.findByLabelText("Username"), "dario");
      await fireEvent.changeText(screen.getByLabelText("Password"), "correct horse");
      await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
      await screen.findByText(theCamera);
    };

    /**
     * Sealing raises the system's prompt, and a dismissed one is a refusal.
     * The switch that then said "on" would be offering a door to a room that
     * was never built.
     */
    it("leaves the switch off when the prompt at sign-in is dismissed", async () => {
      const storage = inMemorySecureStorage(
        { [LANGUAGE_KEY]: "en" },
        { canUnlock: true, answersThePrompt: false },
      );

      await renderApp({ screen: { name: "Tabs" }, storage });
      await signInWithAPassword();
      await openTheAccountScreen();

      expect(
        await screen.findByRole("switch", { name: THE_SWITCH, checked: false }),
      ).toBeOnTheScreen();
      expect(await storage.read(SEALED_UNTIL_KEY)).toBeNull();
    });

    it("leaves the switch off when the prompt it raised itself is dismissed", async () => {
      const storage = aPhoneHoldingAnUnsealedSession({ answersThePrompt: false });

      await renderApp({ screen: { name: "Tabs" }, storage });
      await screen.findByText(theCamera);
      await openTheAccountScreen();

      await fireEvent.press(await screen.findByRole("switch", { name: THE_SWITCH }));
      await fireEvent.press(await screen.findByRole("button", { name: TURN_ON }));

      expect(
        await screen.findByRole("switch", { name: THE_SWITCH, checked: false }),
      ).toBeOnTheScreen();
      expect(await storage.read(SEALED_UNTIL_KEY)).toBeNull();
    });

    /**
     * The other half, and the one that used to leave rubbish behind: the seal
     * SUCCEEDED and the note beside it could not be written. A sealed token
     * with nothing pointing at it is never offered and never cleaned up, so
     * the roll-back takes it with the note.
     */
    it("leaves nothing sealed when the note beside it cannot be written", async () => {
      const phone = aPhoneHoldingAnUnsealedSession();
      const storage: SecureStorage = {
        ...phone,
        write: async (key, value) => {
          if (key === SEALED_UNTIL_KEY) {
            throw new Error("The keystore refused to write the note");
          }

          await phone.write(key, value);
        },
      };

      await renderApp({ screen: { name: "Tabs" }, storage });
      await screen.findByText(theCamera);
      await openTheAccountScreen();

      await fireEvent.press(await screen.findByRole("switch", { name: THE_SWITCH }));
      await fireEvent.press(await screen.findByRole("button", { name: TURN_ON }));

      expect(
        await screen.findByRole("switch", { name: THE_SWITCH, checked: false }),
      ).toBeOnTheScreen();
      await waitFor(async () => {
        expect(await storage.unlock(SESSION_KEY, A_SEAL_PROMPT)).toBeNull();
      });
      expect(await storage.read(SEALED_UNTIL_KEY)).toBeNull();
    });

    /**
     * A sealed token no note points at is the same rubbish whichever write
     * dropped it, so signing in gets the same roll-back the switch does.
     */
    it("leaves nothing sealed when a sign-in cannot write the note either", async () => {
      const phone = inMemorySecureStorage({ [LANGUAGE_KEY]: "en" }, { canUnlock: true });
      const storage: SecureStorage = {
        ...phone,
        write: async (key, value) => {
          if (key === SEALED_UNTIL_KEY) {
            throw new Error("The keystore refused to write the note");
          }

          await phone.write(key, value);
        },
      };

      await renderApp({ screen: { name: "Tabs" }, storage });
      await signInWithAPassword();
      await openTheAccountScreen();

      expect(
        await screen.findByRole("switch", { name: THE_SWITCH, checked: false }),
      ).toBeOnTheScreen();
      await waitFor(async () => {
        expect(await storage.unlock(SESSION_KEY, A_SEAL_PROMPT)).toBeNull();
      });
      expect(await storage.read(SEALED_UNTIL_KEY)).toBeNull();
    });
  });

  describe("in Spanish", () => {
    it("names the switch and says what turning it off costs", async () => {
      const storage = aPhoneHoldingASealedSession("es");

      await renderApp({ screen: { name: "Tabs" }, storage });
      await screen.findByText(/escanear una etiqueta/i);
      await openTheAccountScreen("Tú, sesión iniciada como dario");

      const toggle = await screen.findByRole("switch", {
        name: "Desbloquear con la huella",
        checked: true,
      });
      await fireEvent.press(toggle);

      expect(
        await screen.findByText(/escribirás tu contraseña la próxima vez que abras Waymark/i),
      ).toBeOnTheScreen();
      expect(screen.getByRole("button", { name: "Desactivarlo" })).toBeOnTheScreen();
    });
  });
});
