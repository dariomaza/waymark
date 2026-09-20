import type { JSX } from "react";

import "./loading.css";

export interface LoadingProps {
  /** Said out loud. "Loading" on its own tells a person nothing. */
  readonly label: string;
}

export const Loading = ({ label }: LoadingProps): JSX.Element => (
  <p className="loading" role="status">
    <span className="loading__dot" aria-hidden="true" />
    {label}
  </p>
);
