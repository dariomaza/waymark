import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { LanguageProvider } from "../../app/language-context.js";
import { OverflowMenu, type OverflowAction } from "./overflow-menu.js";

const draw = (actions: readonly OverflowAction[]): void => {
  render(
    <MemoryRouter initialEntries={["/here"]}>
      <LanguageProvider>
        <Routes>
          <Route
            path="/here"
            element={<OverflowMenu label="More actions for Box 3" actions={actions} />}
          />
          <Route path="/there" element={<p>The other place</p>} />
        </Routes>
      </LanguageProvider>
    </MemoryRouter>,
  );
};

const open = async (): Promise<HTMLElement> => {
  await userEvent.click(screen.getByRole("button", { name: "More actions for Box 3" }));

  return await screen.findByRole("dialog", { name: "More actions for Box 3" });
};

/**
 * # The control that ends a column of identical blocks
 *
 * Nine things a screen could do, all shouting at the same volume, is not a
 * layout problem — it is a priority nobody decided, and the layout was being
 * asked to express it. This is where everything that is not the point of the
 * screen goes, so that the one thing that IS the point can be the only lime
 * rectangle on it.
 *
 * What is asserted here is what a person can DO: reach it with a thumb or with
 * a keyboard alone, find out what is behind it, choose something, and get back
 * out without having chosen anything. The picture is not asserted anywhere —
 * that is the icon atom's job, and a test that repeats a shape only proves the
 * file was copied.
 */
describe("everything a screen can do that is not the thing it is for", () => {
  /**
   * Three dots say nothing on their own. An icon-only control with no name is
   * a control somebody can see and nobody else can find, which is the exact
   * mistake this whole change exists to stop repeating.
   */
  it("is one control with no words in it, that still says what it is for", () => {
    draw([{ label: "Delete", onSelect: () => undefined }]);

    const trigger = screen.getByRole("button", { name: "More actions for Box 3" });

    expect(trigger).toHaveTextContent("");
    expect(trigger).toHaveAccessibleName("More actions for Box 3");
  });

  it("keeps what is behind it off the screen until it is asked", () => {
    draw([{ label: "Delete", onSelect: () => undefined }]);

    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("shows every one of them once it is opened", async () => {
    draw([
      { label: "Edit", onSelect: () => undefined },
      { label: "Move", onSelect: () => undefined },
      { label: "Delete", tone: "danger", onSelect: () => undefined },
    ]);

    const menu = await open();

    for (const name of ["Edit", "Move", "Delete"]) {
      expect(await screen.findByRole("button", { name })).toBeVisible();
    }

    expect(menu).toBeVisible();
  });

  it("does the thing that was chosen, and gets out of the way", async () => {
    const deleted = vi.fn();
    draw([{ label: "Delete", tone: "danger", onSelect: deleted }]);

    await open();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(deleted).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("goes where a line that is a way somewhere says it goes", async () => {
    draw([{ label: "Search inside", to: "/there" }]);

    await open();
    await userEvent.click(screen.getByRole("link", { name: "Search inside" }));

    expect(await screen.findByText("The other place")).toBeVisible();
  });

  /**
   * Opened by accident, closed by reflex. Escape is the way out of every panel
   * in this app, and the focus has to come back to the control that was
   * pressed — landing on `<body>` means the next Tab starts from the top of
   * the page rather than from where the person was.
   */
  it("closes on Escape, having done nothing, and hands the focus back", async () => {
    const chosen = vi.fn();
    draw([{ label: "Delete", tone: "danger", onSelect: chosen }]);

    const trigger = screen.getByRole("button", { name: "More actions for Box 3" });
    await open();
    await userEvent.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(chosen).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });

  /**
   * A menu no keyboard can open is a menu that has taken seven actions away
   * from somebody. Tab reaches the control and Enter opens it, with no pointer
   * anywhere in this test.
   */
  it("opens for a keyboard that never touches a pointer", async () => {
    draw([{ label: "Empty", onSelect: () => undefined }]);

    await userEvent.tab();
    expect(screen.getByRole("button", { name: "More actions for Box 3" })).toHaveFocus();

    await userEvent.keyboard("{Enter}");

    expect(
      await screen.findByRole("dialog", { name: "More actions for Box 3" }),
    ).toBeVisible();
    expect(await screen.findByRole("button", { name: "Empty" })).toBeVisible();
  });

  /**
   * The panel is a dialog rather than an ARIA `menu`, and the control has to
   * say so: `aria-haspopup="dialog"` is the difference between a screen reader
   * announcing "opens a dialog" and announcing nothing at all.
   */
  it("warns a screen reader that a panel is about to open", async () => {
    draw([{ label: "Empty", onSelect: () => undefined }]);

    const trigger = screen.getByRole("button", { name: "More actions for Box 3" });
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await open();

    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });
});
