import { SearchMatchField } from "@ariadna/domain";
import { useId, type JSX } from "react";
import { Link } from "react-router-dom";

import "./search-hit.css";

export interface SearchHitProps {
  readonly title: string;
  readonly to: string;
  /** `Garage > Metal wardrobe > Box 3`, already joined by the API. */
  readonly location: string;
  readonly matchedFields: readonly SearchMatchField[];
  readonly detail?: string | undefined;
}

const FIELD_WORDS: Readonly<Record<SearchMatchField, string>> = {
  [SearchMatchField.NAME]: "name",
  [SearchMatchField.TAG]: "tag",
  [SearchMatchField.DESCRIPTION]: "description",
};

/**
 * One answer to "where is my stuff".
 *
 * The breadcrumb is the result, not a decoration on it: "you own a cordless
 * drill" is something the person already knew. It is shown as the joined
 * `location` the API sends, because a result row is read at a glance.
 *
 * `matchedFields` says why this is here at all. An item called `HDMI 2.1`
 * answering a search for `cables` looks like a mistake until the row says
 * "matched tag", and then it looks like the feature working.
 */
export const SearchHit = ({
  title,
  to,
  location,
  matchedFields,
  detail,
}: SearchHitProps): JSX.Element => {
  const titleId = useId();

  return (
    <li>
      <article className="search-hit" aria-labelledby={titleId}>
        <Link className="search-hit__link" to={to}>
          <span className="search-hit__title" id={titleId}>
            {title}
          </span>
          <span className="search-hit__where">{location}</span>
        </Link>
        <p className="search-hit__why">
          Matched {matchedFields.map((field) => FIELD_WORDS[field]).join(", ")}
          {detail === undefined ? null : ` · ${detail}`}
        </p>
      </article>
    </li>
  );
};
