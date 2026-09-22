import { describeFailure, fieldComplaints } from "@ariadna/i18n";
import type { UnitId } from "@ariadna/domain";
import type { JSX } from "react";

import { Callout } from "../ui/atoms/callout.js";
import { Sheet } from "../ui/organisms/sheet.js";
import { useCreateItem } from "./item-mutations.js";
import { ItemForm } from "./views/item-form.js";
import { useTranslate } from "../app/language-context.js";

export interface CreateItemSheetProps {
  readonly storageUnitId: UnitId;
  readonly unitName: string;
  readonly onClose: () => void;
}

const EMPTY = { name: "", description: null, quantity: 1, tags: [] } as const;

export const CreateItemSheet = ({
  storageUnitId,
  unitName,
  onClose,
}: CreateItemSheetProps): JSX.Element => {
  const t = useTranslate();

  const create = useCreateItem();
  const complaints = fieldComplaints(create.error);

  return (
    <Sheet title={`Add an item to ${unitName}`} onClose={onClose}>
      {create.isError && complaints.length === 0 ? (
        <Callout tone="wrong">{t(describeFailure(create.error))}</Callout>
      ) : null}

      <ItemForm
        initial={EMPTY}
        submitLabel="Create"
        busy={create.isPending}
        complaints={complaints}
        onSubmit={(values) => {
          create.mutate({ storageUnitId, ...values }, { onSuccess: onClose });
        }}
      />
    </Sheet>
  );
};
