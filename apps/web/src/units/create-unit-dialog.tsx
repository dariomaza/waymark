import { describeFailure } from "@ariadna/api-client";
import { StorageUnitKind, type UnitId } from "@ariadna/domain";
import type { JSX } from "react";

import { Sheet } from "../ui/organisms/sheet.js";
import { useCreateUnit } from "./unit-mutations.js";
import { fieldComplaints } from "./unit-messages.js";
import { UnitForm } from "./views/unit-form.js";

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
  const create = useCreateUnit();
  const problems = fieldComplaints(create.error);

  return (
    <Sheet
      title={parentId === null ? "Add a room" : "Add a unit inside"}
      onClose={onClose}
    >
      <UnitForm
        submitLabel="Create"
        // What a person most likely means here: a root is a room, a child is
        // a box. A guess, never a rule — nesting is not constrained by kind.
        initial={{
          name: "",
          kind: parentId === null ? StorageUnitKind.ROOM : StorageUnitKind.BOX,
          description: "",
        }}
        busy={create.isPending}
        failure={
          create.isError && problems.length === 0 ? describeFailure(create.error) : null
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
