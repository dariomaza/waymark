import type { JSX } from "react";

import { describeFailure, failureTone, type ItemView } from "@ariadna/api-client";
import { Sheet } from "../ui/organisms/sheet.js";
import { fieldComplaints } from "../units/unit-messages.js";
import { useUpdateItem } from "./item-mutations.js";
import { ItemForm } from "./views/item-form.js";

export interface EditItemDialogProps {
  readonly item: ItemView;
  readonly onClose: () => void;
}

/**
 * Container: owns the request, hands the form what the item currently says.
 *
 * The tags go back whole, which is the API's shape and the only one that can
 * take a tag off. The quantity goes as typed, including a zero — the domain
 * decides what a quantity may be and answers `InvalidQuantity`, and a second
 * copy of that rule here is how the two come to disagree.
 *
 * Which box holds it is not offered: moving is `Move`, all or nothing across
 * a batch (ADR 3), and it has a screen of its own.
 */
export const EditItemDialog = ({ item, onClose }: EditItemDialogProps): JSX.Element => {
  const edit = useUpdateItem(item.id);
  const problems = fieldComplaints(edit.error);

  return (
    <Sheet title={`Edit ${item.name}`} onClose={onClose}>
      <ItemForm
        submitLabel="Save"
        initial={{
          name: item.name,
          description: item.description ?? "",
          quantity: item.quantity,
          tags: item.tags,
        }}
        busy={edit.isPending}
        failure={edit.isError && problems.length === 0 ? describeFailure(edit.error) : null}
        failureTone={failureTone(edit.error)}
        fieldProblems={problems}
        onCancel={onClose}
        onSubmit={(values) => {
          edit.mutate(
            {
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
