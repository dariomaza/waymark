import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "./button.js";

/**
 * # A word with a picture in front of it, and what the picture must not do
 *
 * The owner asked for more icons because a wall of identical word-buttons has
 * no personality and nothing for the eye to aim at. The trap on the way there
 * is announcing the picture as well as the word, so that "Edit" is read out
 * as "pencil Edit" — which is not personality, it is noise, and only the
 * people who cannot see the picture ever hear it.
 */
describe("a button carrying a picture", () => {
  it("is still called exactly what it says", () => {
    render(<Button icon="pencil">Edit</Button>);

    expect(screen.getByRole("button")).toHaveAccessibleName("Edit");
  });

  it("hides the picture from assistive technology, because the word is there", () => {
    const { container } = render(<Button icon="trash">Delete</Button>);

    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("still reads its word, so nobody has to learn a shape", () => {
    render(<Button icon="move">Move</Button>);

    expect(screen.getByRole("button")).toHaveTextContent("Move");
  });

  /**
   * The escape hatch, and the only shape allowed to drop its word: a control
   * whose name comes from `aria-label` instead. It is asserted here so that
   * the pattern is written down once rather than rediscovered per screen.
   */
  it("can drop the word entirely, as long as it keeps a name", () => {
    render(<Button icon="close" aria-label="Close" />);

    const button = screen.getByRole("button");
    expect(button).toHaveAccessibleName("Close");
    expect(button).toHaveTextContent("");
  });
});

/**
 * # A link wearing the button's clothes
 *
 * `.button` is not worn only by `<button>`. Three places hand it to a `<Link>`
 * — the home screen, a label's way back to its unit, and every line in the
 * overflow that goes somewhere — because a way somewhere stays a link: it is a
 * URL, it belongs in the history, and turning it into a button would take that
 * away for the sake of one shared shape.
 *
 * A browser underlines an `<a>`, and this class never said otherwise. What the
 * owner saw on his phone was a bordered rectangle with underlined words inside
 * it, which reads as neither a link nor a button. Four other classes in this
 * codebase each turn the underline off on their own — `row-link`, `item-card`,
 * `search-hit`, `bottom-nav` — and the one that most looks like a button was
 * the only one that forgot.
 *
 * The CASCADE is asserted and not the source text. A test that greps its own
 * stylesheet for `text-decoration: none` passes just as happily for a rule
 * sitting inside a media query that never matches, or for a declaration a
 * later rule overrides — so the stylesheet is handed to the DOM and the
 * question is put to the browser instead.
 */
describe("a link wearing the button's clothes", () => {
  // Read rather than imported: this config leaves CSS out of the module graph
  // (see `vite.config.ts`), so an `import "./button.css"` is a no-op here.
  const BUTTON_CSS = readFileSync(join(process.cwd(), "src/ui/atoms/button.css"), "utf8");

  const drawnWith = (markup: string): CSSStyleDeclaration => {
    document.head.innerHTML = `<style>${BUTTON_CSS}</style>`;
    document.body.innerHTML = markup;

    const link = document.querySelector("a");
    if (link === null) {
      throw new Error("that markup has no link in it");
    }

    return globalThis.getComputedStyle(link);
  };

  /**
   * The control, and the reason the next test cannot be green for the wrong
   * reason: if this harness did not apply a browser's own underline in the
   * first place, an assertion that the underline is gone would prove nothing.
   */
  it("is underlined by the browser when nothing says otherwise", () => {
    expect(drawnWith(`<a href="/labels">Label sheet</a>`).textDecoration).toBe("underline");
  });

  it("carries no underline, because it is drawn as a button", () => {
    expect(
      drawnWith(`<a class="button button--secondary" href="/labels">Label sheet</a>`)
        .textDecoration,
    ).toBe("none");
  });

  /** Every variant, because the reset belongs to the shape and not to a tone. */
  it("drops it in every tone, since the shape is what wears the clothes", () => {
    for (const tone of ["primary", "secondary", "danger", "quiet"]) {
      expect(
        drawnWith(`<a class="button button--${tone}" href="/x">Go</a>`).textDecoration,
      ).toBe("none");
    }
  });
});
