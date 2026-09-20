import type { JSX, ReactNode } from "react";

import "./callout.css";

/**
 * The three things this app has to say, and they are not interchangeable.
 *
 * `blocked` is a refusal about the WORLD — the box still has things in it —
 * and it usually comes with a button that changes the world. `wrong` is a
 * refusal about the REQUEST, and it belongs next to the field that caused it.
 * `note` is neither. ADR 8 draws that line in the API; this is where it
 * reaches a person.
 */
export type CalloutTone = "blocked" | "wrong" | "note";

export interface CalloutProps {
  readonly tone: CalloutTone;
  readonly title?: string | undefined;
  readonly children: ReactNode;
  /** What to do about it. A refusal with no way forward is a dead end. */
  readonly action?: ReactNode;
}

export const Callout = ({ tone, title, children, action }: CalloutProps): JSX.Element => (
  <div
    className={`callout callout--${tone}`}
    // A refusal interrupts; a note does not.
    role={tone === "note" ? "status" : "alert"}
  >
    <div className="callout__body">
      {title === undefined ? null : <p className="callout__title">{title}</p>}
      <div className="callout__text">{children}</div>
    </div>
    {action === undefined ? null : <div className="callout__action">{action}</div>}
  </div>
);
