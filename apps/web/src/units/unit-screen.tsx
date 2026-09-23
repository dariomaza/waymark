import { unitId } from "@waymark/domain";
import type { JSX } from "react";
import { useParams } from "react-router-dom";

import { BulkMoveBar } from "../items/bulk-move-bar.js";
import { useItemSelection } from "../items/use-item-selection.js";
import { ItemCover } from "../photos/item-cover.js";
import { UnitPhoto } from "../photos/unit-photo.js";
import { Checkbox } from "../ui/atoms/checkbox.js";
import { Loading } from "../ui/atoms/loading.js";
import { FailureNote } from "../ui/molecules/failure-note.js";
import { UnitActions } from "./unit-actions.js";
import { UnitMenu } from "./unit-menu.js";
import { useStorageUnit } from "./unit-queries.js";
import { UnitDetail } from "./views/unit-detail.js";
import { useTranslate } from "../app/language-context.js";

/**
 * One storage unit: where it is, what is inside it, and what can be done to
 * it.
 *
 * The container owns the id from the URL, the request, the three states it
 * can be in, and which items are ticked for a bulk move. Everything it draws
 * when the request worked is one presentational component away.
 *
 * What CAN be done arrives in two pieces, and the split is the whole of ADR
 * 21: `UnitActions` is what this screen is for — putting something in the box
 * — and `UnitMenu` is everything that can be done to the box itself, behind
 * one control beside its name. This file no longer owns a dialog of its own,
 * because the screen no longer has an action of its own.
 */
export const UnitScreen = (): JSX.Element => {
  const t = useTranslate();

  const params = useParams<{ id: string }>();
  const id = unitId(params.id ?? "");
  const unit = useStorageUnit(id);
  const selection = useItemSelection();

  return (
    <main className="screen">
      {unit.isPending ? <Loading label={t("units.loading")} /> : null}

      {unit.isError ? (
        <FailureNote
          error={unit.error}
          title={t("units.notOpen")}
          onRetry={() => {
            void unit.refetch();
          }}
        />
      ) : null}

      {unit.isSuccess ? (
        <UnitDetail
          unit={unit.data.unit}
          path={unit.data.path}
          childUnits={unit.data.children}
          items={unit.data.items}
          photo={<UnitPhoto unit={unit.data.unit} />}
          itemPhoto={(item) => <ItemCover item={item} />}
          actions={<UnitActions unit={unit.data.unit} />}
          menu={<UnitMenu unit={unit.data.unit} path={unit.data.path} />}
          itemTrailing={(item) => (
            <Checkbox
              className="checkbox--bare"
              label={t("units.select", { name: item.name })}
              checked={selection.isSelected(item.id)}
              onChange={() => {
                selection.toggle(item.id);
              }}
            />
          )}
          belowItems={
            selection.selected.length === 0 ? null : (
              <BulkMoveBar itemIds={selection.selected} onDone={selection.clear} />
            )
          }
        />
      ) : null}
    </main>
  );
};
