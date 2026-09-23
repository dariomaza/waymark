import type { ItemView, StorageUnitView } from "@waymark/api-client";
import type { JSX, ReactNode } from "react";

import { Breadcrumb } from "../../ui/molecules/breadcrumb.js";
import "./item-detail.css";
import { unitPath } from "../../app/routes.js";
import { useTranslate } from "../../app/language-context.js";

export interface ItemDetailProps {
  readonly item: ItemView;
  /** Root first, ending at the unit that holds it. Every step is tappable. */
  readonly path: readonly StorageUnitView[];
  /** What this screen is FOR: the primary action, and at most one secondary. */
  readonly actions?: ReactNode;
  /**
   * Everything that can be done TO this item, behind one control beside its
   * name. Beside the NAME and not in the row, because these are acts on the
   * thing rather than on the screen — and because the bin used to sit one
   * thumb's width from the control somebody actually meant to press (ADR 21).
   */
  readonly menu?: ReactNode;
  readonly photos?: ReactNode;
}

/** Presentational. An item, and the answer to where it is. */
export const ItemDetail = ({
  item,
  path,
  actions,
  menu,
  photos,
}: ItemDetailProps): JSX.Element => {
  const t = useTranslate();

  return (
    <>
      <Breadcrumb steps={path.map((step) => ({ name: step.name, to: unitPath(step.id) }))} />

      <header className="item-detail__head">
        <div className="item-detail__title">
          <h2>{item.name}</h2>
          {menu}
        </div>
        {item.quantity > 1 ? (
          <p className="item-detail__quantity">
            {t("items.quantityIs", { count: item.quantity })}
          </p>
        ) : null}
      </header>

      {/*
        Above the photographs, not below them. What the screen is FOR should
        not be past a column of pictures on a phone — and it is where the unit
        screen puts its row, so the two detail screens agree about where a
        person looks for the thing to do.
      */}
      {actions === undefined ? null : <div className="item-detail__actions">{actions}</div>}

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
    </>
);
};
