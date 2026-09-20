import type { ButtonHTMLAttributes, JSX } from "react";

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
}

export const Button = ({
  tone = "secondary",
  block = false,
  type = "button",
  className,
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
  />
);
