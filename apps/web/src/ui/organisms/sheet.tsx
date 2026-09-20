import { useEffect, useId, useRef, type JSX, type ReactNode } from "react";

import { Button } from "../atoms/button.js";
import "./sheet.css";

export interface SheetProps {
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

/**
 * A panel that slides up from the bottom of the screen.
 *
 * Bottom, not centre: a dialog in the middle of a phone puts its buttons
 * where the thumb cannot reach without changing grip, which on a step ladder
 * is a real cost. Everything that asks a question here — create, move, empty,
 * delete — uses the same one.
 */
export const Sheet = ({ title, onClose, children }: SheetProps): JSX.Element => {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panel.current?.focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
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
            Close
          </Button>
        </div>
        <div className="sheet__body">{children}</div>
      </div>
    </div>
  );
};
