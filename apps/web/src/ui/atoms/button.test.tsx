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
