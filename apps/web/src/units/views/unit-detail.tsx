import { type ItemView, type StorageUnitView } from "@ariadna/api-client";
import { kindLabel } from "@ariadna/i18n";
import type { JSX, ReactNode } from "react";

import { ItemCard } from "../../items/views/item-card.js";
import { Breadcrumb } from "../../ui/molecules/breadcrumb.js";
import { EmptyNote } from "../../ui/molecules/empty-note.js";
import { RowLink } from "../../ui/molecules/row-link.js";

import "./unit-detail.css";
import { thingPath, unitPath } from "../../app/routes.js";
import { useTranslate } from "../../app/language-context.js";

export interface UnitDetailProps {
  readonly unit: StorageUnitView;
  /** Root first, ending at this unit. */
  readonly path: readonly StorageUnitView[];
  readonly childUnits: readonly StorageUnitView[];
  readonly items: readonly ItemView[];
  /** What can be done to this unit. Injected, so this view stays a view. */
  readonly actions?: ReactNode;
  /** A photo of the unit, when there is one. */
  readonly photo?: ReactNode;
  /** Rendered next to each item row; a checkbox during a bulk move. */
  readonly itemTrailing?: (item: ItemView) => ReactNode;
  /**
   * The cover photo for one item, when it has one.
   *
   * Injected rather than fetched here, because a thumbnail is an
   * authenticated request and this file is a view. Returning nothing is what
   * makes a card fall back to its initials.
   */
  readonly itemPhoto?: (item: ItemView) => ReactNode;
  /** Sits under the item list; the bulk move bar, when anything is ticked. */
  readonly belowItems?: ReactNode;
}

/**
 * What one storage unit holds.
 *
 * Purely presentational: everything it can show arrives as props, including
 * the buttons. It has no idea that deleting can be refused, which is exactly
 * why the container above it can grow that behaviour without touching this.
 */
export const UnitDetail = ({
  unit,
  path,
  childUnits,
  items,
  actions,
  photo,
  itemTrailing,
  itemPhoto,
  belowItems,
}: UnitDetailProps): JSX.Element => {
  const t = useTranslate();

  const isEmpty = childUnits.length === 0 && items.length === 0;

  return (
    <>
      <Breadcrumb
        steps={path.map((step, index) => ({
          name: step.name,
          ...(index === path.length - 1 ? {} : { to: unitPath(step.id) }),
        }))}
      />

      <header className="unit-detail__head">
        <h2>{unit.name}</h2>
        <p className="unit-detail__kind">{kindLabel(t, unit.kind)}</p>
        {unit.description === null ? null : (
          <p className="unit-detail__description">{unit.description}</p>
        )}
      </header>

      {photo}
      {actions === undefined ? null : <div className="unit-detail__actions">{actions}</div>}

      {isEmpty ? (
        <EmptyNote explains="Whatever you put in here will show up when you scan its label.">
          This one is empty
        </EmptyNote>
      ) : null}

      {childUnits.length === 0 ? null : (
        <section>
          <h3>Units inside</h3>
          <ul aria-label="Units inside">
            {childUnits.map((child) => (
              <li key={child.id}>
                <RowLink
                  to={unitPath(child.id)}
                  title={child.name}
                  meta={kindLabel(t, child.kind)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {items.length === 0 ? null : (
        <section>
          <h3>Items</h3>
          {/**
           * A grid, because a thing is recognised by its picture. Its second
           * line is the tags: inside a unit the location is the same string
           * on every card, which is noise rather than an answer.
           */}
          <ul className="item-grid" aria-label="Items">
            {items.map((item) => (
              <li key={item.id}>
                <ItemCard
                  to={thingPath(item.id)}
                  name={item.name}
                  secondary={item.tags.join(", ")}
                  quantity={item.quantity}
                  photo={itemPhoto?.(item)}
                  {...(itemTrailing === undefined ? {} : { trailing: itemTrailing(item) })}
                />
              </li>
            ))}
          </ul>
          {belowItems}
        </section>
      )}
    </>
  );
};
