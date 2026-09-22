import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { ItemCard } from "./item-card.js";

const draw = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe("one thing, as a card", () => {
  it("is a link named after the thing", () => {
    draw(<ItemCard to="/things/1" name="Cordless drill" />);

    expect(screen.getByRole("link", { name: /cordless drill/i })).toHaveAttribute(
      "href",
      "/things/1",
    );
  });

  it("shows the photo when there is one", () => {
    draw(<ItemCard to="/things/1" name="Cordless drill" photo={<img alt="" src="/p.jpg" />} />);

    expect(screen.getByRole("link").querySelector("img")).toBeInTheDocument();
  });

  /**
   * The case that fills most of the grid at the start: forty things get
   * registered in an afternoon and photographed another day.
   */
  it("falls back to initials, without announcing them twice", () => {
    draw(<ItemCard to="/things/1" name="Cinta aislante" />);

    const link = screen.getByRole("link");
    expect(within(link).getByText("CA")).toHaveAttribute("aria-hidden", "true");
    // The accessible name stays the thing's name, not "CA Cinta aislante".
    expect(link).toHaveAccessibleName("Cinta aislante");
  });

  describe("how many of it there are", () => {
    it("says so when there is more than one", () => {
      draw(<ItemCard to="/things/1" name="HDMI cables" quantity={8} />);

      expect(screen.getByText("×8")).toBeVisible();
    });

    /** "×1" on every single card is noise that hides the cards that mean it. */
    it("stays quiet about the ordinary single thing", () => {
      draw(<ItemCard to="/things/1" name="Cordless drill" quantity={1} />);

      expect(screen.queryByText(/^×/)).not.toBeInTheDocument();
    });

    /**
     * The badge sits over the photo rather than under the name because in a
     * card the name is what truncates — and a long name is exactly when you
     * most need to know there are twelve of them.
     */
    it("survives a name far too long for the card", () => {
      draw(
        <ItemCard
          to="/things/1"
          name="Brocas de pared de widia surtidas en estuche metálico"
          quantity={12}
        />,
      );

      expect(screen.getByText("×12")).toBeVisible();
    });
  });

  describe("the one line under the name", () => {
    it("says whatever the screen decided it says", () => {
      draw(<ItemCard to="/things/1" name="Cordless drill" secondary="Box 3" />);

      expect(screen.getByText("Box 3")).toBeVisible();
    });

    it("leaves the line out rather than drawing an empty one", () => {
      const { container } = draw(
        <ItemCard to="/things/1" name="Cordless drill" secondary="" />,
      );

      expect(container.querySelector(".item-card__secondary")).toBeNull();
    });
  });
});
