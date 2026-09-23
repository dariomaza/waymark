import { useState, type InputHTMLAttributes, type JSX } from "react";

import { Icon } from "../atoms/icon.js";
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
 * ## It is an icon INSIDE the field, and that is the whole shape of it
 *
 * It was a full-width button under the field, in the same tone and the same
 * size as `Sign in` directly below — two primary buttons stacked, one of which
 * announced that looking at your password mattered as much as signing in.
 *
 * The argument for putting it outside was real and the conclusion was not: an
 * inset icon must not shrink below a 48px target, and must not sit where a
 * thumb rests while typing. Both are solved by the FIELD being big enough.
 * The input is at least 48px tall and 56 with its border, so a 48px control
 * fits inside it with room around it, and `field__input--with-trailing`
 * reserves the space with `padding-right` so the text stops before the icon
 * rather than running under it. It sits at the right edge, which on a phone
 * held one-handed is the far corner from where a thumb rests.
 *
 * ## The state is announced, not implied
 *
 * It is one toggle with `aria-pressed`, not two buttons taking turns, and the
 * label does NOT flip. "Show password" describes what the next press will do
 * and never says which world you are in now — and the person who most needs
 * to be told is exactly the one who cannot look at the field to find out.
 * `aria-pressed` answers "is it showing?", so a screen reader says "Show
 * password, toggle button, pressed" and the question is closed.
 *
 * The icon does not flip either, for the same reason: it means "showing the
 * password", and swapping it for a crossed-out eye would put a second,
 * contradictory answer next to a label that deliberately stays put. What
 * carries the state visually is the fill, which is the same vocabulary the
 * language switcher uses for its chosen option.
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
    <TextField
      id={id}
      label={label}
      type={shown ? "text" : "password"}
      /*
       * Three separate refusals, not one habit copied from the username.
       *
       * A masked field is one most mobile keyboards already treat as a
       * special case, which is why the omission never showed. The reveal
       * ends that: with `type="text"` the keyboard sees prose, and
       * capitalises the first letter of a string where case is the whole
       * point, offers to correct a password into a dictionary word it can
       * spell, and underlines it as a mistake.
       *
       * `spellCheck` is the one that is not cosmetic. A spell checker is a
       * service, and more than one browser has sent the contents of a
       * checked field away to be looked up — which here is the password
       * leaving the device.
       */
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      trailing={
        <button
          type="button"
          className="password-field__reveal"
          /*
           * An icon-only control has no text, so the label is the whole of its
           * accessible name — and it is a real name rather than a description
           * of the picture: "Show password", not "eye".
           */
          aria-label={t("login.showPassword")}
          aria-pressed={shown}
          aria-controls={id}
          onClick={() => {
            setShown((was) => !was);
          }}
        >
          <Icon name="eye" size={20} />
        </button>
      }
      {...rest}
    />
  );
};
