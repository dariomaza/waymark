import type { ButtonHTMLAttributes, JSX } from "react";

import { Icon, type IconName } from "./icon.js";
import "./button.css";

/**
 * What a button MEANS, not what it looks like.
 *
 * `danger` is the one that deletes; `primary` is the one thing a screen wants
 * you to do. Every one of them is at least 48px tall, because this app is used
 * one-handed, standing up, in a garage.
 */
export type ButtonTone = "primary" | "secondary" | "danger" | "quiet";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly tone?: ButtonTone;
  /** Grows to the full width of its container. */
  readonly block?: boolean;
  /**
   * A shape in FRONT of the word, never instead of it.
   *
   * A screen of eight identical word-buttons gives the eye nothing to aim at,
   * and a hand reaching for "Move" reads all eight to find it. A picture is
   * what makes one of them findable without reading — which is the whole of
   * what it is for here, and why it is hidden from assistive technology: the
   * word is already there, and announcing both says the same thing twice.
   *
   * A button MAY drop its word, but only by taking an `aria-label` instead —
   * an icon with no accessible name is a control nobody using a screen reader
   * can press on purpose. See the sheet's close control.
   */
  readonly icon?: IconName;
}

export const Button = ({
  tone = "secondary",
  block = false,
  type = "button",
  className,
  icon,
  children,
  ...rest
}: ButtonProps): JSX.Element => (
  <button
    // Never `submit` by accident: a button inside a form that submits it
    // without saying so is how a delete confirmation turns into a save.
    type={type}
    className={[`button button--${tone}`, block ? "button--block" : "", className ?? ""]
      .filter(Boolean)
      .join(" ")}
    {...rest}
  >
    {icon === undefined ? null : <Icon name={icon} size={18} />}
    {children}
  </button>
);
