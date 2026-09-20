import type { InputHTMLAttributes, JSX } from "react";

import "./text-field.css";

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  readonly id: string;
  readonly label: string;
  readonly hint?: string | undefined;
  /** Said out loud by a screen reader, and shown under the field. */
  readonly error?: string | undefined;
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
      <input
        className="field__input"
        id={id}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={describedBy === "" ? undefined : describedBy}
        {...rest}
      />
      {error === undefined ? null : (
        <p className="field__error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  );
};
