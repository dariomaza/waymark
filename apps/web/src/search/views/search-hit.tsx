import { SearchMatchField } from "@waymark/domain";
import { useId, type JSX } from "react";
import { Link } from "react-router-dom";

import "./search-hit.css";
import type { MessageKey } from "@waymark/i18n";
import { useTranslate } from "../../app/language-context.js";

export interface SearchHitProps {
  readonly title: string;
  readonly to: string;
  /** `Garage > Metal wardrobe > Box 3`, already joined by the API. */
  readonly location: string;
  readonly matchedFields: readonly SearchMatchField[];
  readonly detail?: string | undefined;
}

export const FIELD_KEYS = {
  [SearchMatchField.NAME]: "search.field.name",
  [SearchMatchField.TAG]: "search.field.tag",
  [SearchMatchField.DESCRIPTION]: "search.field.description",
} as const satisfies Readonly<Record<SearchMatchField, MessageKey>>;

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
  const t = useTranslate();

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
          {t("search.matched", {
            fields: matchedFields.map((field) => t(FIELD_KEYS[field])).join(", "),
          })}
          {detail === undefined ? null : ` · ${detail}`}
        </p>
      </article>
    </li>
  );
};
