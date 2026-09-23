import { useEffect, useId, useRef, type JSX, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Button } from "../atoms/button.js";
import "./sheet.css";
import { useTranslate } from "../../app/language-context.js";

export interface SheetProps {
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

/**
 * Everything a keyboard can land on, in the order Tab visits it.
 *
 * Disabled and explicitly skipped controls are left out because the browser
 * leaves them out too, and a trap that disagrees with Tab about what is next
 * is a trap that drops the focus into nothing. Visibility is deliberately
 * NOT consulted: a sheet draws all of its controls, and asking the layout
 * engine would make this untestable in jsdom for no behaviour gained.
 */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
]
  .map((selector) => `${selector}:not([hidden])`)
  .join(", ");

/**
 * A panel that slides up from the bottom of the screen.
 *
 * Bottom, not centre: a dialog in the middle of a phone puts its buttons
 * where the thumb cannot reach without changing grip, which on a step ladder
 * is a real cost. Everything that asks a question here — create, move, empty,
 * delete — uses the same one.
 *
 * ## `aria-modal` is a promise, and the keyboard is where it is kept
 *
 * Saying `aria-modal="true"` tells a screen reader that nothing outside this
 * panel matters. Focusing the panel is not enough to make that true: one Tab
 * past the last button and the focus ring is on the screen behind, on
 * controls the person cannot see and did not ask for, with no way back
 * without the mouse they are not holding.
 *
 * So Tab is cycled inside the panel and the focus is handed back to whatever
 * opened the sheet when it closes — because landing on `<body>` afterwards
 * means the next Tab starts from the top of the page rather than from the
 * button that was just pressed.
 *
 * The trap is a `keydown` listener on the document rather than on the panel
 * on purpose: it is the same listener Escape already needs, and a focus that
 * somehow escaped can still be pulled back by it.
 *
 * ## Why it is drawn on `<body>` and not where it is written
 *
 * Because a modal that renders where it was opened from inherits whatever
 * that place has done to the painting order, and one of those places had done
 * something.
 *
 * `AccountSheet` is handed to `AppBar` as its `actions`, so this panel used to
 * render inside `<header class="app-bar">`. That header is `position: sticky`
 * with a `z-index`, which makes it A STACKING CONTEXT: every descendant of it
 * is painted inside it, `position: fixed` ones included, and their `z-index`
 * orders them against each other and against nothing outside. So the sheet's
 * `z-index: 20` was never compared with the navigation's `z-index: 10`. What
 * was compared was the header (10) against the navigation (10) — a tie, which
 * document order gives to the navigation, because it comes last in the shell.
 * The result was a sign-out button cut in half on a real phone.
 *
 * No number fixes that. `z-index: 100` on the panel is ordered inside the same
 * trapped context; raising the HEADER above the navigation would move the bug
 * to the next piece of chrome anybody adds.
 *
 * A portal removes the question. The panel becomes a sibling of the
 * application root, in the root stacking context, where 20 and 10 are finally
 * two numbers about the same thing. It is also what `aria-modal` has been
 * claiming all along: this is not a part of the bar, it is on top of the page.
 *
 * Nothing else changes. React events still propagate through the component
 * tree rather than the DOM tree, so the state above this component works
 * exactly as it did, and the keyboard listener was already on the document.
 */
export const Sheet = ({ title, onClose, children }: SheetProps): JSX.Element => {
  const t = useTranslate();

  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Captured before the panel takes the focus, so it is the element that
    // opened the sheet rather than the panel itself.
    const opener = document.activeElement;
    panel.current?.focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose();

        return;
      }

      if (event.key !== "Tab" || panel.current === null) {
        return;
      }

      const controls = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = controls[0];
      const last = controls.at(-1);
      if (first === undefined || last === undefined) {
        // Nothing to tab to; the panel keeps the focus it already has.
        event.preventDefault();

        return;
      }

      const active = document.activeElement;
      const at = active === null ? -1 : controls.indexOf(active as HTMLElement);

      // `-1` is the panel itself, which holds the focus on open, or anything
      // that escaped. Either way the next stop is inside.
      if (at === -1 || (event.shiftKey ? at === 0 : at === controls.length - 1)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);

      // Handing the focus back matters as much as trapping it: a sheet that
      // leaves it on `<body>` makes the next Tab start from the top of the
      // page instead of from the button that was just pressed.
      //
      // Only when the focus is still the sheet's to give, though. If it moved
      // somewhere else entirely — the person clicked another control — taking
      // it back would be this component overruling them.
      const active = document.activeElement;
      const sheetHadIt =
        active === null ||
        active === document.body ||
        panel.current?.contains(active) === true;

      if (opener instanceof HTMLElement && sheetHadIt) {
        opener.focus();
      }
    };
  }, [onClose]);

  return createPortal(
    <div className="sheet__backdrop">
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={panel}
        tabIndex={-1}
      >
        <div className="sheet__head">
          <h3 id={titleId}>{title}</h3>
          <Button tone="quiet" onClick={onClose}>
            {t("action.close")}
          </Button>
        </div>
        <div className="sheet__body">{children}</div>
      </div>
    </div>,
    document.body,
  );
};
