import { type StorageUnitView, failureTone } from "@ariadna/api-client";
import { describeFailure, fieldComplaints } from "@ariadna/i18n";
import type { JSX } from "react";

import { Sheet } from "../ui/organisms/sheet.js";
import { useUpdateUnit } from "./unit-mutations.js";

import { UnitForm } from "./views/unit-form.js";
import { useTranslate } from "../app/language-context.js";

export interface EditUnitDialogProps {
  readonly unit: StorageUnitView;
  readonly onClose: () => void;
}

/**
 * Container: owns the request, hands the form what the unit currently says.
 *
 * It sends all three editable fields rather than only the ones that changed.
 * A patch is a statement about what the unit should now say, and working out
 * a diff here would be this screen deciding what the person meant — with the
 * one interesting case, a description cleared back to empty, indistinguishable
 * from a description left alone.
 *
 * Where the unit is is not offered at all. Moving it is a button of its own,
 * because the rule behind it is (ADR 2).
 */
export const EditUnitDialog = ({ unit, onClose }: EditUnitDialogProps): JSX.Element => {
  const t = useTranslate();

  const edit = useUpdateUnit(unit.id);
  const problems = fieldComplaints(edit.error);

  return (
    <Sheet title={`Edit ${unit.name}`} onClose={onClose}>
      <UnitForm
        submitLabel="Save"
        initial={{
          name: unit.name,
          kind: unit.kind,
          description: unit.description ?? "",
        }}
        busy={edit.isPending}
        failure={edit.isError && problems.length === 0 ? t(describeFailure(edit.error)) : null}
        failureTone={failureTone(edit.error)}
        fieldProblems={problems}
        onCancel={onClose}
        onSubmit={(values) => {
          edit.mutate(
            {
              name: values.name,
              kind: values.kind,
              description: values.description === "" ? null : values.description,
            },
            { onSuccess: onClose },
          );
        }}
      />
    </Sheet>
  );
};
