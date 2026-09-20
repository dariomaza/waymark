import { unitId } from "@ariadna/domain";
import { useState, type JSX } from "react";
import { useParams } from "react-router-dom";

import { BulkMoveBar } from "../items/bulk-move-bar.js";
import { CreateItemDialog } from "../items/create-item-dialog.js";
import { useItemSelection } from "../items/use-item-selection.js";
import { Button } from "../ui/atoms/button.js";
import { Checkbox } from "../ui/atoms/checkbox.js";
import { Loading } from "../ui/atoms/loading.js";
import { FailureNote } from "../ui/molecules/failure-note.js";
import { UnitActions } from "./unit-actions.js";
import { useStorageUnit } from "./unit-queries.js";
import { UnitDetail } from "./views/unit-detail.js";

/**
 * One storage unit: where it is, what is inside it, and what can be done to
 * it.
 *
 * The container owns the id from the URL, the request, the three states it
 * can be in, and which items are ticked for a bulk move. Everything it draws
 * when the request worked is one presentational component away.
 */
export const UnitScreen = (): JSX.Element => {
  const params = useParams<{ id: string }>();
  const id = unitId(params.id ?? "");
  const unit = useStorageUnit(id);
  const selection = useItemSelection();
  const [addingItem, setAddingItem] = useState(false);

  return (
    <main className="screen">
      {unit.isPending ? <Loading label="Loading this unit" /> : null}

      {unit.isError ? (
        <FailureNote
          error={unit.error}
          title="That box is not open"
          onRetry={() => {
            void unit.refetch();
          }}
        />
      ) : null}

      {unit.isSuccess ? (
        <>
          <UnitDetail
            unit={unit.data.unit}
            path={unit.data.path}
            childUnits={unit.data.children}
            items={unit.data.items}
            actions={
              <>
                <Button
                  tone="primary"
                  onClick={() => {
                    setAddingItem(true);
                  }}
                >
                  Add an item
                </Button>
                <UnitActions unit={unit.data.unit} path={unit.data.path} />
              </>
            }
            itemTrailing={(item) => (
              <Checkbox
                className="checkbox--bare"
                label={`Select ${item.name}`}
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

          {addingItem ? (
            <CreateItemDialog
              storageUnitId={unit.data.unit.id}
              unitName={unit.data.unit.name}
              onClose={() => {
                setAddingItem(false);
              }}
            />
          ) : null}
        </>
      ) : null}
    </main>
  );
};
