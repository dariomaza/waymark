import { fireEvent, renderApp, screen } from "../testing/render-app.js";

/**
 * # Typing a password one-handed, in a garage, with a thumb
 *
 * The field is masked, which is right, and until now there was no way to look
 * at what had been typed. A password typed wrong under a mask is a failed sign
 * in with no way to find out which character went astray, and the phone's own
 * keyboard was making that likelier: Android offers suggestions, autocorrects
 * and capitalises unless told not to, separately, one prop at a time.
 */
const thePasswordField = (): ReturnType<typeof screen.getByLabelText> =>
  screen.getByLabelText("Password");

describe("the password field", () => {
  describe("looking at what you typed", () => {
    it("masks what is typed until somebody asks to see it", async () => {
      await renderApp({ screen: { name: "Tabs" } });

      await screen.findByLabelText("Password");

      expect(thePasswordField().props.secureTextEntry).toBe(true);
    });

    /**
     * The control is a SWITCH rather than a button, because the one thing a
     * person needs to know before pressing it is which way it is currently
     * set. A button called "Show password" announces the same five syllables
     * whether the password is on screen or not, which is half a control: it
     * says what pressing it might do and withholds what is true right now.
     *
     * So the name stays still and the STATE moves, which is exactly what a
     * switch is for — and it is what a screen reader reads out on landing,
     * without having to press anything to find out.
     */
    it("is a switch that says whether the password is showing", async () => {
      await renderApp({ screen: { name: "Tabs" } });

      const reveal = await screen.findByRole("switch", { name: "Show password" });
      expect(reveal).not.toBeChecked();

      await fireEvent.press(reveal);

      expect(thePasswordField().props.secureTextEntry).toBe(false);
      expect(screen.getByRole("switch", { name: "Show password" })).toBeChecked();
    });

    it("puts the mask back", async () => {
      await renderApp({ screen: { name: "Tabs" } });

      const reveal = await screen.findByRole("switch", { name: "Show password" });
      await fireEvent.press(reveal);
      await fireEvent.press(screen.getByRole("switch", { name: "Show password" }));

      expect(thePasswordField().props.secureTextEntry).toBe(true);
      expect(screen.getByRole("switch", { name: "Show password" })).not.toBeChecked();
    });

    /** Looking at it must not lose it. */
    it("keeps what was typed when the mask comes off", async () => {
      await renderApp({ screen: { name: "Tabs" } });

      await fireEvent.changeText(await screen.findByLabelText("Password"), "correct horse");
      await fireEvent.press(screen.getByRole("switch", { name: "Show password" }));

      expect(thePasswordField().props.value).toBe("correct horse");
    });
  });

  /**
   * # What the keyboard must not do to a password
   *
   * Four separate props, and getting one leaves the others on. A password is
   * not a word: correcting it, capitalising its first letter, underlining it
   * as a spelling mistake or offering it to the suggestion strip are all
   * wrong, and the last one is the one that leaks — a password that goes into
   * the keyboard's learned-words dictionary is a password sitting outside the
   * keystore this app went to some trouble to put it in.
   */
  describe("what the keyboard is told", () => {
    it("asks for no autocorrect, no spelling, no capitals", async () => {
      await renderApp({ screen: { name: "Tabs" } });

      await screen.findByLabelText("Password");
      const field = thePasswordField();

      expect(field.props.autoCorrect).toBe(false);
      expect(field.props.spellCheck).toBe(false);
      expect(field.props.autoCapitalize).toBe("none");
    });

    /**
     * The one that is not obvious. `secureTextEntry` is what suppresses the
     * suggestion strip on Android — so the moment the mask comes off, the
     * field is an ordinary text input and the suggestions come back, on the
     * one field they must never see.
     *
     * `visible-password` is Android's own answer: the input type that means
     * "a password somebody is looking at", which keeps the IME's suggestions
     * and learning off while the characters are readable. It is set only when
     * the mask is off, because React Native draws the text unmasked when it is
     * combined with `secureTextEntry`.
     */
    it("keeps the suggestion strip away once the password is on screen", async () => {
      await renderApp({ screen: { name: "Tabs" } });

      await screen.findByLabelText("Password");
      expect(thePasswordField().props.keyboardType).toBe("default");

      await fireEvent.press(screen.getByRole("switch", { name: "Show password" }));

      expect(thePasswordField().props.keyboardType).toBe("visible-password");
      expect(thePasswordField().props.autoCorrect).toBe(false);
      expect(thePasswordField().props.spellCheck).toBe(false);
      expect(thePasswordField().props.autoCapitalize).toBe("none");
    });
  });

  /** Every word of it, including the one only a screen reader says. */
  describe("in Spanish", () => {
    it("names the control in the language on screen", async () => {
      await renderApp({ screen: { name: "Tabs" }, language: "es" });

      expect(
        await screen.findByRole("switch", { name: "Mostrar la contraseña" }),
      ).toBeOnTheScreen();
    });
  });
});
