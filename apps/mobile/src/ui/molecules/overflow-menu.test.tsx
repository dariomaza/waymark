import { fireEvent, render, screen } from "@testing-library/react-native";

import { LanguageProvider } from "../../app/language-context.js";
import type { LanguageStore } from "../../app/language.js";
import { TAP_TARGET } from "../styles/tokens.js";
import { OverflowMenu, type OverflowAction } from "./overflow-menu.js";

/** English, with no keystore behind it: this file asserts a shape, not a word. */
const inEnglish: LanguageStore = {
  read: async () => "en",
  save: async () => undefined,
};

const draw = (actions: readonly OverflowAction[]) =>
  render(
    <LanguageProvider store={inEnglish}>
      <OverflowMenu label="More actions for Box 3" actions={actions} />
    </LanguageProvider>,
  );

const openIt = async (): Promise<void> => {
  await fireEvent.press(
    await screen.findByRole("button", { name: "More actions for Box 3" }),
  );
};

/**
 * # The control that ends a column of identical blocks
 *
 * Six controls stacked down a phone, all the same size and the same weight,
 * is a wall a thumb has to READ to use — and no amount of spacing fixes it,
 * because the layout was being asked to express a priority nobody had decided.
 * ADR 21 decides it: one primary, at most one secondary, everything else here.
 *
 * What is asserted is what a person can DO. The picture is not asserted
 * anywhere; that is the icon atom's job.
 */
describe("everything a screen can do that is not the thing it is for", () => {
  it("is one control with no words in it, that still says what it is for", async () => {
    await draw([{ label: "Delete", onSelect: () => undefined }]);

    expect(
      await screen.findByRole("button", { name: "More actions for Box 3" }),
    ).toBeOnTheScreen();
    expect(screen.queryByText("More actions for Box 3")).toBeNull();
  });

  it("keeps what is behind it off the screen until it is asked", async () => {
    await draw([{ label: "Delete", onSelect: () => undefined }]);

    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("shows every one of them once it is opened", async () => {
    await draw([
      { label: "Edit", onSelect: () => undefined },
      { label: "Move", onSelect: () => undefined },
      { label: "Delete", tone: "danger", destructive: true, onSelect: () => undefined },
    ]);

    await openIt();

    for (const name of ["Edit", "Move", "Delete"]) {
      expect(await screen.findByRole("button", { name })).toBeOnTheScreen();
    }
  });

  it("does the thing that was chosen, and gets out of the way", async () => {
    const deleted = jest.fn();
    await draw([{ label: "Delete", tone: "danger", destructive: true, onSelect: deleted }]);

    await openIt();
    await fireEvent.press(await screen.findByRole("button", { name: "Delete" }));

    expect(deleted).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  /**
   * Opened by accident, closed without choosing. The way out is the same X
   * every other panel in this app has, in the same corner, because this is
   * that panel — and the back gesture reaches it through the `onRequestClose`
   * the sheet already wires, which is why there is nothing here about it.
   */
  it("closes again having done nothing, when the way out is taken", async () => {
    const chosen = jest.fn();
    await draw([{ label: "Delete", tone: "danger", destructive: true, onSelect: chosen }]);

    await openIt();
    await fireEvent.press(await screen.findByRole("button", { name: "Close" }));

    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    expect(chosen).not.toHaveBeenCalled();
  });

  /**
   * A thumb is about 9mm across and this app is used standing up, in a garage,
   * one-handed. 48 is the floor, and a control with no word in it is exactly
   * where a floor stops being automatic.
   */
  it("is big enough to hit without looking", async () => {
    await draw([{ label: "Delete", onSelect: () => undefined }]);

    const trigger = await screen.findByRole("button", { name: "More actions for Box 3" });

    expect(trigger).toHaveStyle({ minHeight: TAP_TARGET, minWidth: TAP_TARGET });
  });
});

/**
 * # A menu is a list to be read down, so its words start where a list starts
 *
 * The lines were centred here and left aligned on the browser. A centred label
 * in a full-width rectangle gives the eye a different starting point on every
 * row, so finding "Move" in a list of seven means reading all seven — which is
 * the failure ADR 21 was written about, one level down inside the thing that
 * was supposed to fix it.
 *
 * The browser had the argument written down already: this is a list to be read
 * down, not a set of peers to be scanned. ADR 22.
 */
describe("the lines of a menu", () => {
  interface RenderedNode {
    readonly props?: { readonly style?: unknown };
    readonly children?: readonly unknown[] | null;
  }

  const flatten = (style: unknown): Record<string, unknown> =>
    Array.isArray(style)
      ? Object.assign({}, ...style.map(flatten))
      : ((style ?? {}) as Record<string, unknown>);

  /**
   * Every style in the tree that places its content across the cross axis.
   *
   * `alignItems` and NOT `justifyContent`, which is the trap this control sits
   * in: the button's Pressable declares no `flexDirection`, so its main axis is
   * vertical and `justifyContent` moves a label up rather than left. Asserting
   * the wrong one of the two passes while the label sits in the wrong place.
   */
  const alignments = (tree: unknown): unknown[] => {
    const found: unknown[] = [];

    const walk = (node: unknown): void => {
      if (node === null || typeof node !== "object") {
        return;
      }

      const style = flatten((node as RenderedNode).props?.style);
      if (style["alignItems"] !== undefined) {
        found.push(style["alignItems"]);
      }

      for (const child of (node as RenderedNode).children ?? []) {
        walk(child);
      }
    };

    walk(tree);

    return found;
  };

  it("start their words where the eye already is, as the browser's do", async () => {
    const drawn = await draw([{ label: "Edit", onSelect: () => undefined }]);
    await openIt();

    expect(alignments(drawn.toJSON())).toContain("flex-start");
  });

  /**
   * The control: the trigger itself is an icon in a square and stays centred,
   * so a blanket change would have shown up here.
   */
  it("leaves the control that opens the menu centred, it being a square", async () => {
    const drawn = await draw([{ label: "Edit", onSelect: () => undefined }]);

    expect(alignments(drawn.toJSON())).toContain("center");
  });
});
