import { PALETTES, schemeFor } from "@waymark/tokens";

import { deviceScheme } from "./theme.js";

/**
 * # What somebody finds when they open the developer tools
 *
 * A person who opens the console on a self-hosted inventory app is curious,
 * and curious people are the only audience this has. It used to be one line
 * of text, on the argument that ASCII art is the width of the window and
 * that the name and the source were all there was to say. The owner found
 * that bland and asked for more — so it draws the mark, and says what this is
 * and where it comes from beside it.
 *
 * What survives of the old argument is the SIZE. A docked devtools panel is
 * narrow, and a picture that wraps is not a picture: twelve lines at most and
 * forty-eight columns at most, which a test holds it to. Still no recruitment
 * pitch and no "you shouldn't be here" warning — that last one is security
 * theatre, since anybody who can read the console can read the bundle beside
 * it. No version either: the bundle does not carry one, and a greeting is
 * not worth a request.
 */
const REPOSITORY = "https://github.com/dariomaza/waymark";

/**
 * The small cut of the mark — the w and the solid pin, the cut the brand uses
 * at icon size — rasterised from `MARK_SMALL` at 22 by 22, four cells to a
 * character. Committed rather than computed, so the bundle carries nine short
 * strings instead of a rasteriser; `console-signature.test.ts` recomputes it
 * from the outlines and fails if the mark ever moves without this.
 */
export const MARK_IN_TYPE: readonly string[] = [
  "     ▗██▖",
  "     ███▙",
  "     ▜██▌",
  "      ▜▛",
  "▐▖ ▄▄ ▗▌",
  "▐▙ ██ ▟▌",
  "▝█ ██▖█▘",
  " █▟▌▐▙█",
  " ▜█▌▐█▛",
];

type Voice = "name" | "words";

/** What is said beside which row of the mark: level with the w, below the pin. */
const BESIDE: Readonly<Record<number, readonly [Voice, string]>> = {
  4: ["name", "Waymark"],
  5: ["words", "Find your way back."],
  7: ["words", "Open source"],
  8: ["words", REPOSITORY],
};

const GAP = "   ";

/** Every block is one UTF-16 unit, so a string's length is its width in columns. */
const WIDTH = Math.max(...MARK_IN_TYPE.map((row) => row.length));

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

/**
 * The colours, from the shared palette. A console's theme follows the device
 * rather than this app's own switch, so it is the device's scheme that is
 * asked: the mark is the lime on a dark console and the ink on a light one,
 * because the brand never draws the lime on white (ADR 24).
 */
const stylesFor = (): Readonly<Record<"mark" | Voice, string>> => {
  const palette = PALETTES[schemeFor("system", deviceScheme())];

  return {
    mark: `color:${palette.mark}`,
    name: `color:${palette.mark};font-weight:700`,
    words: `color:${palette.inkMuted}`,
  };
};

export const printConsoleSignature = ({
  log = console.info,
  styled = supportsStyling(),
}: ConsoleSignatureOptions = {}): void => {
  try {
    const styles = stylesFor();
    const format: string[] = [];
    const plain: string[] = [];
    const css: string[] = [];

    MARK_IN_TYPE.forEach((row, index) => {
      const said = BESIDE[index];
      const art = said === undefined ? row : row.padEnd(WIDTH);

      plain.push(said === undefined ? art : `${art}${GAP}${said[1]}`);
      format.push(said === undefined ? `%c${art}` : `%c${art}%c${GAP}${said[1]}`);
      css.push(styles.mark, ...(said === undefined ? [] : [styles[said[0]]]));
    });

    if (styled) {
      log(format.join("\n"), ...css);

      return;
    }

    log(plain.join("\n"));
  } catch {
    // A greeting is never worth a blank screen. Some embedded webviews hand
    // out a `console` whose methods throw, and this file is not important
    // enough to be the reason one of them shows nothing.
  }
};
