import { useState, type JSX } from "react";

import { Icon } from "../atoms/icon.js";
import "./copyable-value.css";

export interface CopyableValueProps {
  /** The exact string shown, and the exact string handed to the clipboard. */
  readonly value: string;
  /** What the string IS, for somebody who cannot see the block it sits in. */
  readonly valueLabel: string;
  /** The name of the control, which is all an icon-only button has. */
  readonly copyLabel: string;
  /** What the control is called once it has worked. */
  readonly copiedLabel: string;
  /** The sentence shown when the browser would not copy. */
  readonly failedLabel: string;
  /** Lets a panel style its own value without this molecule knowing about it. */
  readonly className?: string | undefined;
}

/**
 * # A string you are meant to take, and the control that takes it
 *
 * Three things in the account sheet are copied — a credential, an address,
 * and the two of them together — and all three need the same three states:
 * untouched, copied, and refused. Written once, they cannot drift apart.
 *
 * ## The control is an icon BESIDE the value, and that is the whole shape
 *
 * It was a full-width button under the value, which is the same mistake the
 * password reveal made and was corrected for: a block in the accent tone,
 * announcing that copying an address mattered as much as the one thing the
 * screen wants you to do. Under the API address it was worse still, because
 * the button was wider than the forty characters it was about.
 *
 * So the value and its control are ONE component rather than two things a
 * screen places near each other. A caller cannot separate them, cannot put a
 * paragraph between them, and cannot forget the refusal sentence — and the
 * eye connects the picture to the string without a caption, which is the only
 * reason an icon is allowed to replace a word at all.
 *
 * The control is 48 by 48 and it sits at the top right of the block rather
 * than beside the last line, so a value that wraps onto four lines on a phone
 * does not push it off the bottom. It is after the value in the DOM, so Tab
 * reaches it from the thing it is about.
 *
 * ## What it says, and when
 *
 * The drawing flips to a tick once it has worked, and so does the button's
 * NAME — which is the half that matters, because somebody who cannot see the
 * tick would otherwise be told nothing happened. This is the one place in the
 * app where an icon flips with the state, and it is allowed because the two
 * shapes are two different facts ("take this" and "taken") rather than two
 * ways of saying one thing, as the password reveal's would have been.
 *
 * The refusal is a sentence and stays one. `navigator.clipboard` is absent
 * over plain HTTP — which is exactly how a self-hosted Waymark on a home
 * network gets reached — and can be refused outright by a permissions policy,
 * so a failure is a normal outcome rather than an exception to let through.
 * It is `role="status"`, so it is announced when it appears rather than only
 * found by somebody who happens to read on. Saying "copy it by hand" is a
 * worse experience and a true sentence; a control that silently did nothing
 * would be neither.
 */
export const CopyableValue = ({
  value,
  valueLabel,
  copyLabel,
  copiedLabel,
  failedLabel,
  className,
}: CopyableValueProps): JSX.Element => {
  const [copied, setCopied] = useState<boolean | null>(null);

  return (
    <div className={["copyable", className ?? ""].filter(Boolean).join(" ")}>
      <div className="copyable__row">
        {/*
          A `<code>` in a block that wraps rather than scrolling sideways: a
          credential with its last eight characters off the right-hand edge of
          a phone is one somebody copies wrongly by hand.
        */}
        <code className="copyable__value" aria-label={valueLabel}>
          {value}
        </code>
        <button
          type="button"
          className="copyable__copy"
          /*
           * An icon-only control has no text, so this is the whole of its
           * accessible name — and it is a real name rather than a description
           * of the picture: "Copy the address", not "two sheets of paper".
           */
          aria-label={copied === true ? copiedLabel : copyLabel}
          onClick={() => {
            void copy(value).then(setCopied);
          }}
        >
          <Icon name={copied === true ? "check" : "copy"} size={20} />
        </button>
      </div>
      {copied === false ? (
        <p className="copyable__failed" role="status">
          {failedLabel}
        </p>
      ) : null}
    </div>
  );
};

/**
 * A refusal is a value, not a throw. Every caller of this wants to SAY
 * something when the clipboard says no, and an exception would make that the
 * caller's problem in three places instead of this one's in one.
 */
const copy = async (value: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(value);

    return true;
  } catch {
    return false;
  }
};
