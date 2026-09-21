import { type ItemView, kindLabel, type StorageUnitView } from "@ariadna/api-client";
import type { JSX, ReactNode } from "react";

import { Breadcrumb } from "../../ui/molecules/breadcrumb.js";
import { EmptyNote } from "../../ui/molecules/empty-note.js";
import { RowLink } from "../../ui/molecules/row-link.js";

import "./unit-detail.css";

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
  belowItems,
}: UnitDetailProps): JSX.Element => {
  const isEmpty = childUnits.length === 0 && items.length === 0;

  return (
    <>
      <Breadcrumb
        steps={path.map((step, index) => ({
          name: step.name,
          ...(index === path.length - 1 ? {} : { to: `/units/${step.id}` }),
        }))}
      />

      <header className="unit-detail__head">
        <h2>{unit.name}</h2>
        <p className="unit-detail__kind">{kindLabel(unit.kind)}</p>
        {unit.description === null ? null : (
          <p className="unit-detail__description">{unit.description}</p>
        )}
      </header>

      {photo}
      {actions === undefined ? null : <div className="unit-detail__actions">{actions}</div>}

      {isEmpty ? <EmptyNote>This one is empty.</EmptyNote> : null}

      {childUnits.length === 0 ? null : (
        <section>
          <h3>Units inside</h3>
          <ul aria-label="Units inside">
            {childUnits.map((child) => (
              <li key={child.id}>
                <RowLink
                  to={`/units/${child.id}`}
                  title={child.name}
                  meta={kindLabel(child.kind)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {items.length === 0 ? null : (
        <section>
          <h3>Items</h3>
          <ul aria-label="Items">
            {items.map((item) => (
              <li key={item.id}>
                <RowLink
                  to={`/items/${item.id}`}
                  title={item.name}
                  meta={itemMeta(item)}
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

const itemMeta = (item: ItemView): string | undefined => {
  const parts = [
    item.quantity > 1 ? `Quantity ${String(item.quantity)}` : "",
    item.tags.join(", "),
  ].filter((part) => part !== "");

  return parts.length === 0 ? undefined : parts.join(" · ");
};
