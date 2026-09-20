import type { JSX, TextareaHTMLAttributes } from "react";

import "./text-field.css";

export interface TextAreaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> {
  readonly id: string;
  readonly label: string;
  readonly hint?: string | undefined;
  readonly error?: string | undefined;
}

export const TextArea = ({
  id,
  label,
  hint,
  error,
  className,
  ...rest
}: TextAreaProps): JSX.Element => {
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
      <textarea
        className="field__input field__input--area"
        id={id}
        rows={3}
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
