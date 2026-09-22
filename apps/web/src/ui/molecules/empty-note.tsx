import type { JSX, ReactNode } from "react";

import "./empty-note.css";

export interface EmptyNoteProps {
  /** The sentence. Reads as a statement about this place, not as an error. */
  readonly children: ReactNode;
  /** One line on what this container is FOR, when that is not obvious. */
  readonly explains?: ReactNode;
  /** What to do about it, when there is something to do. */
  readonly action?: ReactNode;
}

/**
 * An empty list is a sentence, not a blank area.
 *
 * It used to be a dashed box in muted text, which undercut that in two ways
 * at once. The border sat at 1.44 contrast — invisible in practice — so the
 * most important thing on an otherwise empty screen was also its most
 * recessive element. And a dashed border means "drop a file here" or "this
 * part is unfinished" in almost every interface vocabulary, so the one
 * element on screen was reading as a placeholder for itself.
 *
 * No box now. The sentence is title-sized and in normal ink, because on an
 * empty screen it is not a note beside the content: it IS the content.
 */
export const EmptyNote = ({ children, explains, action }: EmptyNoteProps): JSX.Element => (
  <div className="empty-note">
    <p className="empty-note__text">{children}</p>
    {explains === undefined ? null : <p className="empty-note__explains">{explains}</p>}
    {action === undefined ? null : <div className="empty-note__action">{action}</div>}
  </div>
);
