import { useState, type JSX } from "react";

import { Button, type ButtonTone } from "../atoms/button.js";
import "./copy-button.css";

export interface CopyButtonProps {
  /** The exact string handed to the clipboard. */
  readonly value: string;
  readonly label: string;
  /** What the button says once it has worked. */
  readonly copiedLabel: string;
  /** The sentence shown when the browser would not copy. */
  readonly failedLabel: string;
  readonly tone?: ButtonTone;
}

/**
 * # Put this string on the clipboard, and say so
 *
 * Three things in the account sheet are copied — a credential, an address,
 * and the two of them together — and all three need the same three states:
 * untouched, copied, and refused. Written once, they cannot drift apart.
 *
 * It takes its words as props rather than translating anything itself, so it
 * stays a piece of the visual vocabulary rather than a piece of the tokens
 * feature. What it knows is the clipboard; what it says is somebody else's.
 */
export const CopyButton = ({
  value,
  label,
  copiedLabel,
  failedLabel,
  tone = "secondary",
}: CopyButtonProps): JSX.Element => {
  const [copied, setCopied] = useState<boolean | null>(null);

  return (
    <span className="copy-button">
      <Button
        tone={tone}
        onClick={() => {
          void copy(value).then(setCopied);
        }}
      >
        {copied === true ? copiedLabel : label}
      </Button>
      {copied === false ? <span className="copy-button__failed">{failedLabel}</span> : null}
    </span>
  );
};

/**
 * `navigator.clipboard` is absent over plain HTTP and can be refused outright
 * by a permissions policy, so a failure is a normal outcome rather than an
 * exception to let through. Saying "copy it by hand" is a worse experience and
 * a true sentence; a button that silently did nothing would be neither.
 */
const copy = async (value: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(value);

    return true;
  } catch {
    return false;
  }
};
