import { describeFailure, fieldComplaints } from "@ariadna/api-client";
import type { UnitId } from "@ariadna/domain";
import type { JSX } from "react";

import { Sheet } from "../ui/organisms/sheet.js";

import { useCreateItem } from "./item-mutations.js";
import { ItemForm } from "./views/item-form.js";

export interface CreateItemDialogProps {
  readonly storageUnitId: UnitId;
  readonly unitName: string;
  readonly onClose: () => void;
}

export const CreateItemDialog = ({
  storageUnitId,
  unitName,
  onClose,
}: CreateItemDialogProps): JSX.Element => {
  const create = useCreateItem();
  const problems = fieldComplaints(create.error);

  return (
    <Sheet title={`Add an item to ${unitName}`} onClose={onClose}>
      <ItemForm
        submitLabel="Add"
        initial={{ name: "", description: "", quantity: 1, tags: [] }}
        busy={create.isPending}
        failure={
          create.isError && problems.length === 0 ? describeFailure(create.error) : null
        }
        fieldProblems={problems}
        onCancel={onClose}
        onSubmit={(values) => {
          create.mutate(
            {
              storageUnitId,
              name: values.name,
              description: values.description === "" ? null : values.description,
              quantity: values.quantity,
              tags: values.tags,
            },
            { onSuccess: onClose },
          );
        }}
      />
    </Sheet>
  );
};
