/**
 * What somebody finds when they open the developer tools.
 *
 * A person who opens the console on a self-hosted inventory app is curious,
 * and curious people are the only audience this message has. So it says what
 * the thing is, where the source lives, and nothing else: no recruitment
 * pitch, no ASCII art the width of the window, no "you shouldn't be here"
 * warning — that last one is security theatre, since anybody who can read the
 * console can read the bundle beside it.
 */
const REPOSITORY = "https://github.com/dariomaza/waymark";

/**
 * `%c` is a console convention, not a web standard.
 *
 * Chrome, Firefox and Safari style the following argument with it; a console
 * that does not support it prints the CSS as literal text, which turns a
 * greeting into gibberish. So the styled form is only used where it is known
 * to work, and everywhere else falls back to plain text that reads fine.
 */
const supportsStyling = (): boolean =>
  typeof navigator !== "undefined" && /chrome|firefox|safari/i.test(navigator.userAgent);

export interface ConsoleSignatureOptions {
  /** Injected so a test can watch it, and so this file logs nowhere by itself. */
  readonly log?: (...args: unknown[]) => void;
  readonly styled?: boolean;
}

export const printConsoleSignature = ({
  log = console.info,
  styled = supportsStyling(),
}: ConsoleSignatureOptions = {}): void => {
  try {
    if (styled) {
      log(
        "%cWaymark%c  Find your way back.\n%cOpen source · %s",
        "color:#c8f04a;font-size:20px;font-weight:700;letter-spacing:-0.02em",
        "color:#a6a8ab;font-size:12px",
        "color:#a6a8ab;font-size:12px",
        REPOSITORY,
      );

      return;
    }

    log(`Waymark — Find your way back.\nOpen source · ${REPOSITORY}`);
  } catch {
    // A greeting is never worth a blank screen. Some embedded webviews hand
    // out a `console` whose methods throw, and this file is not important
    // enough to be the reason one of them shows nothing.
  }
};
