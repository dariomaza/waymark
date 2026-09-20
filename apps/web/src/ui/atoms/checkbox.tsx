import type { InputHTMLAttributes, JSX } from "react";

import "./checkbox.css";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Said out loud. "Select Cordless drill", not "Select". */
  readonly label: string;
}

export const Checkbox = ({ label, className, ...rest }: CheckboxProps): JSX.Element => (
  <label className={["checkbox", className ?? ""].filter(Boolean).join(" ")}>
    <input type="checkbox" {...rest} />
    <span className="checkbox__label">{label}</span>
  </label>
);
