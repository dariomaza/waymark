import { type FieldComplaint, kindChoices } from "@waymark/i18n";
import { StorageUnitKind } from "@waymark/domain";
import { useState, type FormEvent, type JSX } from "react";

import { Button } from "../../ui/atoms/button.js";
import { Callout, type CalloutTone } from "../../ui/atoms/callout.js";
import { SelectField } from "../../ui/atoms/select-field.js";
import { TextArea } from "../../ui/atoms/text-area.js";
import { TextField } from "../../ui/atoms/text-field.js";
import { useTranslate } from "../../app/language-context.js";

export interface UnitFormValues {
  readonly name: string;
  readonly kind: StorageUnitKind;
  readonly description: string;
}

export interface UnitFormProps {
  readonly submitLabel: string;
  /**
   * What the fields start holding: empty and a likely kind when creating,
   * what the unit currently says when editing. One prop, because a form that
   * knew which of the two it was would be two forms.
   */
  readonly initial: UnitFormValues;
  readonly busy: boolean;
  /** One sentence about a failure that was not about a single field. */
  readonly failure: string | null;
  /** `blocked` for a refusal about the world, `wrong` about the request (ADR 8). */
  readonly failureTone?: CalloutTone;
  /** The API's own complaints, shown against the fields they name. */
  readonly fieldProblems: readonly FieldComplaint[];
  readonly onSubmit: (values: UnitFormValues) => void;
  readonly onCancel: () => void;
}

/**
 * Presentational. It holds what has been typed, and tells whoever asked.
 *
 * It does not know the length limit on a name. The API does, it says so in
 * words when a name is too long, and those words are shown against the field
 * — a second copy of the rule here is how the two come to disagree.
 */
export const UnitForm = ({
  submitLabel,
  initial,
  busy,
  failure,
  failureTone = "wrong",
  fieldProblems,
  onSubmit,
  onCancel,
}: UnitFormProps): JSX.Element => {
  const t = useTranslate();

  const [name, setName] = useState(initial.name);
  const [kind, setKind] = useState<StorageUnitKind>(initial.kind);
  const [description, setDescription] = useState(initial.description);

  const complaintFor = (field: string): string | undefined =>
    fieldProblems.find((problem) => problem.field === field)?.message;

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onSubmit({ name, kind, description });
  };

  return (
    <form onSubmit={submit} noValidate>
      <div className="sheet__body">
        {failure === null ? null : <Callout tone={failureTone}>{failure}</Callout>}

        <TextField
          id="unit-name"
          label={t("units.name")}
          required
          autoFocus
          value={name}
          error={complaintFor("name")}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />

        <SelectField
          id="unit-kind"
          label={t("units.kind")}
          hint={t("units.kindHint")}
          value={kind}
          options={kindChoices(t).map((choice) => ({
            value: choice.kind,
            label: choice.label,
          }))}
          onChange={(event) => {
            setKind(event.target.value as StorageUnitKind);
          }}
        />

        <TextArea
          id="unit-description"
          label={t("units.description")}
          hint={t("action.optional")}
          value={description}
          error={complaintFor("description")}
          onChange={(event) => {
            setDescription(event.target.value);
          }}
        />

        <div className="sheet__buttons">
          <Button onClick={onCancel}>{t("action.cancel")}</Button>
          <Button type="submit" tone="primary" disabled={busy}>
            {busy ? t("action.saving") : submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
};
