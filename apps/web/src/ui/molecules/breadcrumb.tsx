import type { JSX } from "react";
import { Link } from "react-router-dom";

import "./breadcrumb.css";
import { useTranslate } from "../../app/language-context.js";

export interface BreadcrumbStep {
  readonly name: string;
  /** A step with nowhere to go is where you already are. */
  readonly to?: string | undefined;
}

export interface BreadcrumbProps {
  readonly steps: readonly BreadcrumbStep[];
}

/**
 * Where a thing is, one tappable step at a time.
 *
 * The API ships `path` as the units themselves precisely so this can be
 * tappable rather than a sentence: "it is in the garage" is only half an
 * answer if you cannot get to the garage from there.
 */
export const Breadcrumb = ({ steps }: BreadcrumbProps): JSX.Element => {
  const t = useTranslate();

  return (
    <nav className="breadcrumb" aria-label={t("shell.breadcrumb")}>
      <ol className="breadcrumb__list">
        {steps.map((step, index) => (
          <li className="breadcrumb__step" key={`${step.name}-${String(index)}`}>
            {step.to === undefined ? (
              <span aria-current="page">{step.name}</span>
            ) : (
              <Link to={step.to}>{step.name}</Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
);
};
