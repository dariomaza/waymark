import { useId, useState, type JSX, type ReactNode } from "react";

import { Button } from "../atoms/button.js";
import "./settings-group.css";

export interface SettingsGroupProps {
  /** The small uppercase title. Also the section's accessible name. */
  readonly title: string;
  /**
   * The sentences that explain the group, folded behind an ⓘ beside the
   * title. Left out, there is no ⓘ.
   */
  readonly about?: readonly string[] | undefined;
  /** The ⓘ's name: "More about Security". Needed whenever `about` is given. */
  readonly aboutLabel?: string | undefined;
  /** The group's one way to add a row, as an icon at the end of the title line. */
  readonly action?: ReactNode;
  /**
   * What is said ABOUT the group rather than drawn as one of its rows — a
   * refusal, a note, a secret shown once. Between the title and the card, so
   * it is read before the rows it concerns and is never mistaken for one.
   */
  readonly notes?: ReactNode;
  /** The rows. Each direct child is one row, and a list's items are rows too. */
  readonly children: ReactNode;
}

/**
 * # A group of settings: a small title, then one card of rows
 *
 * The account screen was selectors floating on their own, two big headings
 * with dividers, a loose card per credential and three paragraphs of
 * explanation. This is what both phones' own settings screens are made of,
 * and what the owner approved: a small uppercase title, and under it ONE
 * raised card whose rows are divided by hairlines.
 *
 * ## The title line carries the group's controls
 *
 * The explanation is behind an ⓘ beside the title rather than printed, so
 * the screen reads as rows; the ⓘ says whether it is open (`aria-expanded`)
 * and which paragraph it opens (`aria-controls`). The group's one way to add
 * a row sits at the end of the same line, as an icon, where the phone's
 * settings put it — never as a full-width word button under the rows.
 *
 * The phone draws the same group from `ui/molecules/settings-group.tsx`.
 */
export const SettingsGroup = ({
  title,
  about,
  aboutLabel,
  action,
  notes,
  children,
}: SettingsGroupProps): JSX.Element => {
  const id = useId();
  const [open, setOpen] = useState(false);

  return (
    <section className="settings-group" aria-labelledby={`${id}-title`}>
      <div className="settings-group__head">
        <h3 className="settings-group__title" id={`${id}-title`}>
          {title}
        </h3>
        {about === undefined ? null : (
          <Button
            tone="quiet"
            icon="info"
            aria-label={aboutLabel}
            aria-expanded={open}
            aria-controls={`${id}-about`}
            onClick={() => {
              setOpen(!open);
            }}
          />
        )}
        <span className="settings-group__end">{action}</span>
      </div>
      {about === undefined ? null : (
        <div className="settings-group__about" id={`${id}-about`} hidden={!open}>
          {about.map((sentence) => (
            <p key={sentence}>{sentence}</p>
          ))}
        </div>
      )}
      {notes}
      <div className="settings-group__card">{children}</div>
    </section>
  );
};
