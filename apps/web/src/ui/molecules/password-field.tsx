import { useState, type InputHTMLAttributes, type JSX } from "react";

import { Button } from "../atoms/button.js";
import { TextField } from "../atoms/text-field.js";
import { useTranslate } from "../../app/language-context.js";
import "./password-field.css";

export interface PasswordFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "type"> {
  readonly id: string;
  readonly label: string;
}

/**
 * # A password, and the choice to look at it
 *
 * A masked field on a phone is a row of dots typed on a keyboard that is
 * wrong about half the time, and a refused sign-in says only that SOMETHING
 * was mistyped. The reveal is not a convenience: it is the only way to tell a
 * wrong password from a wrong keystroke without typing it all again.
 *
 * ## The state is announced, not implied
 *
 * It is one toggle with `aria-pressed`, not two buttons taking turns. A label
 * that flips between "Show password" and "Hide password" describes what the
 * next press will do and never says which world you are in now — and the
 * person who most needs to be told is exactly the one who cannot look at the
 * field to find out. `aria-pressed` is the attribute that answers "is it
 * showing?", so a screen reader says "Show password, toggle button, pressed"
 * and the question is closed. The word therefore stays put, and the pressed
 * look comes from the attribute rather than from a second string.
 *
 * It sits after the field in the DOM, so Tab reaches it from the input it is
 * about, and it is a real `<button>` so Enter and Space work without this
 * component reimplementing either.
 *
 * ## What it does NOT do
 *
 * It does not turn off `autoComplete`. The phone's own password manager fills
 * this form and should keep doing so; revealing what it filled is the same
 * need as revealing what was typed.
 */
export const PasswordField = ({ id, label, ...rest }: PasswordFieldProps): JSX.Element => {
  const t = useTranslate();

  const [shown, setShown] = useState(false);

  return (
    <div className="password-field">
      <TextField id={id} label={label} type={shown ? "text" : "password"} {...rest} />
      <Button
        tone="quiet"
        className="password-field__reveal"
        aria-pressed={shown}
        aria-controls={id}
        onClick={() => {
          setShown((was) => !was);
        }}
      >
        {t("login.showPassword")}
      </Button>
    </div>
  );
};
