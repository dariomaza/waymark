import type { JSX, ReactNode } from "react";

import "./empty-note.css";

export interface EmptyNoteProps {
  readonly children: ReactNode;
  /** What to do about it, when there is something to do. */
  readonly action?: ReactNode;
}

/**
 * An empty list is a sentence, not a blank area. "This one is empty" and a
 * way to change that beats a gap somebody reads as a failure to load.
 */
export const EmptyNote = ({ children, action }: EmptyNoteProps): JSX.Element => (
  <div className="empty-note">
    <p className="empty-note__text">{children}</p>
    {action === undefined ? null : <div className="empty-note__action">{action}</div>}
  </div>
);
