import { type ItemView } from "@waymark/api-client";
import { describeFailure, fieldComplaints } from "@waymark/i18n";
import type { JSX } from "react";

import { Callout } from "../ui/atoms/callout.js";
import { Sheet } from "../ui/organisms/sheet.js";
import { useUpdateItem } from "./item-mutations.js";
import { ItemForm } from "./views/item-form.js";
import { useTranslate } from "../app/language-context.js";

/**
 * Editing is a separate button from moving (ADR 14). This form cannot express
 * a `storageUnitId`, and neither can the route behind it: the API refuses the
 * key rather than ignoring it, so a client can never believe it moved
 * something it did not.
 */
export const EditItemSheet = ({
  item,
  onClose,
}: {
  readonly item: ItemView;
  readonly onClose: () => void;
}): JSX.Element => {
  const t = useTranslate();

  const edit = useUpdateItem(item.id);
  const complaints = fieldComplaints(edit.error);

  return (
    <Sheet title={t("sheet.edit", { name: item.name })} onClose={onClose}>
      {edit.isError && complaints.length === 0 ? (
        <Callout tone="wrong">{t(describeFailure(edit.error))}</Callout>
      ) : null}

      <ItemForm
        initial={{
          name: item.name,
          description: item.description,
          quantity: item.quantity,
          tags: item.tags,
        }}
        submitLabel={t("action.saveChanges")}
        busy={edit.isPending}
        complaints={complaints}
        onSubmit={(values) => {
          edit.mutate(values, { onSuccess: onClose });
        }}
      />
    </Sheet>
  );
};
