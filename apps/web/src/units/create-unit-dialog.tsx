import { describeFailure, fieldComplaints } from "@waymark/i18n";
import { StorageUnitKind, type UnitId } from "@waymark/domain";
import type { JSX } from "react";

import { Sheet } from "../ui/organisms/sheet.js";
import { useCreateUnit } from "./unit-mutations.js";

import { UnitForm } from "./views/unit-form.js";
import { useTranslate } from "../app/language-context.js";

export interface CreateUnitDialogProps {
  /** `null` starts a new root: a room, a shed, a house. */
  readonly parentId: UnitId | null;
  readonly onClose: () => void;
}

/** Container: owns the request, hands the form its three props. */
export const CreateUnitDialog = ({
  parentId,
  onClose,
}: CreateUnitDialogProps): JSX.Element => {
  const t = useTranslate();

  const create = useCreateUnit();
  const problems = fieldComplaints(create.error);

  return (
    <Sheet
      title={parentId === null ? t("inventory.addSpace") : t("units.addInside")}
      onClose={onClose}
    >
      <UnitForm
        submitLabel={t("action.create")}
        // What a person most likely means here: a root is a room, a child is
        // a box. A guess, never a rule — nesting is not constrained by kind.
        initial={{
          name: "",
          kind: parentId === null ? StorageUnitKind.ROOM : StorageUnitKind.BOX,
          description: "",
        }}
        busy={create.isPending}
        failure={
          create.isError && problems.length === 0 ? t(describeFailure(create.error)) : null
        }
        fieldProblems={problems}
        onCancel={onClose}
        onSubmit={(values) => {
          create.mutate(
            {
              parentId,
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
