import { describeFailure, fieldComplaints } from "@ariadna/i18n";
import type { UnitId } from "@ariadna/domain";
import type { JSX } from "react";

import { Sheet } from "../ui/organisms/sheet.js";

import { useCreateItem } from "./item-mutations.js";
import { ItemForm } from "./views/item-form.js";
import { useTranslate } from "../app/language-context.js";

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
  const t = useTranslate();

  const create = useCreateItem();
  const problems = fieldComplaints(create.error);

  return (
    <Sheet title={t("sheet.addItemTo", { name: unitName })} onClose={onClose}>
      <ItemForm
        submitLabel="Add"
        initial={{ name: "", description: "", quantity: 1, tags: [] }}
        busy={create.isPending}
        failure={
          create.isError && problems.length === 0 ? t(describeFailure(create.error)) : null
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
