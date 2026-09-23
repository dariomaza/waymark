import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { QuietLink } from "./quiet-link.js";

/**
 * # A way somewhere that is not what the screen is for
 *
 * The owner, looking at the home screen: "lo mejor sería el botón principal en
 * grande y lo de las etiquetas en pequeñito con un icono al lado".
 *
 * Two controls of the same shape say they are two of the same kind of thing.
 * Adding a room is what the home screen is FOR; a sheet of labels is a
 * different errand that happens to start here. ADR 21 gave a screen one
 * primary and one secondary and gave the secondary the outlined rectangle,
 * which is the right shape for a second ACTION and the wrong one for a second
 * PLACE.
 *
 * ## The one thing that must not shrink with it
 *
 * Visual weight and touch area are different things, and this is the shape
 * where they are most easily confused: small text with an icon beside it looks
 * exactly like something that should occupy the height of a line. It must not.
 * A thumb is about 9mm across, this app is used standing up holding a box, and
 * 48px is the floor for everything pressable in it.
 *
 * That floor is what these tests are mostly about, because it is the part a
 * later "tidy up" would take away without anything looking wrong.
 */
describe("a quiet way somewhere", () => {
  // Read rather than imported: this config leaves CSS out of the module graph
  // (see `vite.config.ts`), so an `import "./quiet-link.css"` is a no-op here.
  const styleSheets = (...names: readonly string[]): string =>
    names.map((name) => readFileSync(join(process.cwd(), `src/ui/atoms/${name}`), "utf8")).join("\n");

  // The cascade cases write straight into the document; without this they
  // would still be standing there when a later case renders a component and
  // asks the screen a question.
  afterEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  const drawn = (markup: string, css: string): CSSStyleDeclaration => {
    document.head.innerHTML = `<style>${css}</style>`;
    document.body.innerHTML = markup;

    const element = document.querySelector("a, button");
    if (element === null) {
      throw new Error("that markup has no control in it");
    }

    return globalThis.getComputedStyle(element);
  };

  const theQuietLink = (): CSSStyleDeclaration =>
    drawn(`<a class="quiet-link" href="/labels">Label sheet</a>`, styleSheets("quiet-link.css"));

  const aSecondaryButton = (): CSSStyleDeclaration =>
    drawn(`<button class="button button--secondary">Label sheet</button>`, styleSheets("button.css"));

  it("keeps a whole thumb to land on, however small it is drawn", () => {
    expect(theQuietLink().minHeight).toBe("48px");
  });

  /**
   * The claim is comparative — "noticeably lighter than a Button" — so it is
   * asserted against the thing it is lighter than, in the same document. An
   * absolute assertion would go on passing on the day somebody quietly took
   * the border off `.button` and the two shapes became one again.
   */
  it("is lighter than the button it is not: no fill and no edge", () => {
    const quiet = theQuietLink();
    const button = aSecondaryButton();

    expect(button.borderTopWidth).toBe("1px");
    expect(quiet.borderTopWidth).toBe("");

    expect(button.background).toBe("var(--color-surface-raised)");
    // The browser's own transparent: nothing is painted behind this control.
    expect(quiet.background).toBe("rgba(0, 0, 0, 0)");
  });

  /** Smaller type than the page it sits on, which is the "pequeñito" part. */
  it("reads smaller than the words around it", () => {
    expect(theQuietLink().fontSize).toBe("var(--text-s)");
  });

  it("is a link and says its own word", () => {
    render(
      <MemoryRouter>
        <QuietLink to="/labels" icon="tags">
          Label sheet
        </QuietLink>
      </MemoryRouter>,
    );

    const link = screen.getByRole("link", { name: "Label sheet" });
    expect(link).toHaveAttribute("href", "/labels");
  });

  /**
   * The picture is beside the word and not instead of it, so announcing both
   * would say the same thing twice — the same rule `Button` keeps.
   */
  it("hides its picture from assistive technology, because the word is there", () => {
    const { container } = render(
      <MemoryRouter>
        <QuietLink to="/labels" icon="tags">
          Label sheet
        </QuietLink>
      </MemoryRouter>,
    );

    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
