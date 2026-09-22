import type { ItemView, StorageUnitView } from "@ariadna/api-client";
import type { JSX, ReactNode } from "react";

import { Breadcrumb } from "../../ui/molecules/breadcrumb.js";
import "./item-detail.css";
import { unitPath } from "../../app/routes.js";
import { useTranslate } from "../../app/language-context.js";

export interface ItemDetailProps {
  readonly item: ItemView;
  /** Root first, ending at the unit that holds it. Every step is tappable. */
  readonly path: readonly StorageUnitView[];
  readonly actions?: ReactNode;
  readonly photos?: ReactNode;
}

/** Presentational. An item, and the answer to where it is. */
export const ItemDetail = ({
  item,
  path,
  actions,
  photos,
}: ItemDetailProps): JSX.Element => {
  const t = useTranslate();

  return (
    <>
      <Breadcrumb steps={path.map((step) => ({ name: step.name, to: unitPath(step.id) }))} />

      <header className="item-detail__head">
        <h2>{item.name}</h2>
        {item.quantity > 1 ? (
          <p className="item-detail__quantity">Quantity {item.quantity}</p>
        ) : null}
      </header>

      {photos}

      {item.description === null ? null : (
        <p className="item-detail__description">{item.description}</p>
      )}

      {item.tags.length === 0 ? null : (
        <ul className="item-detail__tags" aria-label={t("items.tags")}>
          {item.tags.map((tag) => (
            <li className="item-detail__tag" key={tag}>
              {tag}
            </li>
          ))}
        </ul>
      )}

      {actions === undefined ? null : <div className="item-detail__actions">{actions}</div>}
    </>
);
};
