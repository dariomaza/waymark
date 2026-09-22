import { describeFailure, fieldComplaints } from "@ariadna/i18n";
import type { StorageUnitKind, UnitId } from "@ariadna/domain";
import { StorageUnitKind as Kinds } from "@ariadna/domain";
import type { JSX } from "react";

import { Callout } from "../ui/atoms/callout.js";
import { Sheet } from "../ui/organisms/sheet.js";
import { useCreateUnit } from "./unit-mutations.js";
import { UnitForm } from "./views/unit-form.js";
import { useTranslate } from "../app/language-context.js";

export interface CreateUnitSheetProps {
  /** `null` makes a root: the house, the garage, the storage room (ADR 1). */
  readonly parentId: UnitId | null;
  readonly parentName: string | null;
  readonly onClose: () => void;
}

const EMPTY = {
  name: "",
  kind: Kinds.BOX as StorageUnitKind,
  description: null,
} as const;

export const CreateUnitSheet = ({
  parentId,
  parentName,
  onClose,
}: CreateUnitSheetProps): JSX.Element => {
  const t = useTranslate();

  const create = useCreateUnit();
  const complaints = fieldComplaints(create.error);

  return (
    <Sheet
      title={parentName === null ? t("inventory.addUnit") : t("sheet.addUnitInside", { name: parentName })}
      onClose={onClose}
    >
      {create.isError && complaints.length === 0 ? (
        <Callout tone="wrong">{t(describeFailure(create.error))}</Callout>
      ) : null}

      <UnitForm
        initial={EMPTY}
        submitLabel={t("action.create")}
        busy={create.isPending}
        complaints={complaints}
        onSubmit={(values) => {
          create.mutate({ parentId, ...values }, { onSuccess: onClose });
        }}
      />
    </Sheet>
  );
};
