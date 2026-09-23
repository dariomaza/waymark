import type { InputHTMLAttributes, JSX, ReactNode } from "react";

import "./text-field.css";

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  readonly id: string;
  readonly label: string;
  readonly hint?: string | undefined;
  /** Said out loud by a screen reader, and shown under the field. */
  readonly error?: string | undefined;
  /**
   * A control that belongs INSIDE the field, at its right edge — the reveal on
   * a password, and nothing else so far.
   *
   * It is a slot on the atom rather than something a caller positions on top,
   * because only the atom knows where its own input is. A wrapper trying to
   * place a button over it would have to guess at the label's height and would
   * be wrong the moment an error appeared underneath.
   *
   * The input reserves room for it with `padding-right`, so text never runs
   * under the control and the 48px target it needs does not shrink to fit.
   */
  readonly trailing?: ReactNode | undefined;
}

/**
 * A labelled input. The label is a real `<label for>`, which is what makes
 * `getByRole("textbox", { name: "Username" })` find it — in a test and in a
 * screen reader alike, for the same reason.
 */
export const TextField = ({
  id,
  label,
  hint,
  error,
  trailing,
  className,
  ...rest
}: TextFieldProps): JSX.Element => {
  const hintId = hint === undefined ? undefined : `${id}-hint`;
  const errorId = error === undefined ? undefined : `${id}-error`;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ");

  return (
    <div className={["field", className ?? ""].filter(Boolean).join(" ")}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {hint === undefined ? null : (
        <p className="field__hint" id={hintId}>
          {hint}
        </p>
      )}
      <div className="field__control">
        <input
          className={[
            "field__input",
            trailing === undefined ? "" : "field__input--with-trailing",
          ]
            .filter(Boolean)
            .join(" ")}
          id={id}
          aria-invalid={error === undefined ? undefined : true}
          aria-describedby={describedBy === "" ? undefined : describedBy}
          {...rest}
        />
        {trailing === undefined ? null : (
          <span className="field__trailing">{trailing}</span>
        )}
      </div>
      {error === undefined ? null : (
        <p className="field__error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  );
};
