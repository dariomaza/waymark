import { type StorageUnitView } from "@ariadna/api-client";
import { describeFailure, fieldComplaints } from "@ariadna/i18n";
import type { JSX } from "react";

import { Callout } from "../ui/atoms/callout.js";
import { Sheet } from "../ui/organisms/sheet.js";
import { useUpdateUnit } from "./unit-mutations.js";
import { UnitForm } from "./views/unit-form.js";
import { useTranslate } from "../app/language-context.js";

export interface EditUnitSheetProps {
  readonly unit: StorageUnitView;
  readonly onClose: () => void;
}

/**
 * Editing is a separate button from moving, on purpose (ADR 14): they are two
 * different acts, and only one of them can make the inventory lie about where
 * something is.
 *
 * Every editable field is sent, not a diff. Working the diff out here would
 * make a description cleared back to empty indistinguishable from one left
 * alone, and those are two different requests.
 */
export const EditUnitSheet = ({ unit, onClose }: EditUnitSheetProps): JSX.Element => {
  const t = useTranslate();

  const edit = useUpdateUnit(unit.id);
  const complaints = fieldComplaints(edit.error);

  return (
    <Sheet title={`Edit ${unit.name}`} onClose={onClose}>
      {edit.isError && complaints.length === 0 ? (
        <Callout tone="wrong">{t(describeFailure(edit.error))}</Callout>
      ) : null}

      <UnitForm
        initial={{ name: unit.name, kind: unit.kind, description: unit.description }}
        submitLabel="Save changes"
        busy={edit.isPending}
        complaints={complaints}
        onSubmit={(values) => {
          edit.mutate(values, { onSuccess: onClose });
        }}
      />
    </Sheet>
  );
};
