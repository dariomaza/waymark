import type { JSX, SelectHTMLAttributes } from "react";

import "./text-field.css";

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

export interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> {
  readonly id: string;
  readonly label: string;
  readonly hint?: string | undefined;
  readonly options: readonly SelectOption[];
}

/**
 * A native `<select>`, on purpose.
 *
 * A custom listbox on a phone is a smaller, worse copy of the one the
 * operating system already draws with a thumb-sized wheel, and it is the
 * single easiest thing to get wrong for a screen reader.
 */
export const SelectField = ({
  id,
  label,
  hint,
  options,
  className,
  ...rest
}: SelectFieldProps): JSX.Element => {
  const hintId = hint === undefined ? undefined : `${id}-hint`;

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
      <select
        className="field__input"
        id={id}
        aria-describedby={hintId}
        {...rest}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
};
