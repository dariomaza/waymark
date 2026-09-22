import { type FieldComplaint, kindChoices } from "@waymark/i18n";
import type { StorageUnitKind } from "@waymark/domain";
import { useState, type JSX } from "react";
import { StyleSheet, View } from "react-native";

import { Button } from "../../ui/atoms/button.js";
import { OptionList } from "../../ui/atoms/option-list.js";
import { TextField } from "../../ui/atoms/text-field.js";
import { space } from "../../ui/styles/tokens.js";
import { useTranslate } from "../../app/language-context.js";

export interface UnitFormValues {
  readonly name: string;
  readonly kind: StorageUnitKind;
  readonly description: string | null;
}

export interface UnitFormProps {
  /** What it starts holding: empty for a new unit, the unit for an edit. */
  readonly initial: UnitFormValues;
  readonly submitLabel: string;
  readonly busy: boolean;
  /** The API's own complaints, next to the fields they name. */
  readonly complaints: readonly FieldComplaint[];
  readonly onSubmit: (values: UnitFormValues) => void;
}

/**
 * Presentational. It holds what has been typed and hands it back, and that is
 * the whole of it.
 *
 * There is no parent here, for either shape. Where a unit IS changes through a
 * route that says `move` (ADR 14), and a field that could do it quietly would
 * hide the subtree check behind something that looks like a rename.
 */
export const UnitForm = ({
  initial,
  submitLabel,
  busy,
  complaints,
  onSubmit,
}: UnitFormProps): JSX.Element => {
  const t = useTranslate();

  const [name, setName] = useState(initial.name);
  const [kind, setKind] = useState<StorageUnitKind>(initial.kind);
  const [description, setDescription] = useState(initial.description ?? "");

  const complaintFor = (field: string): string | null =>
    complaints.find((complaint) => complaint.field === field)?.message ?? null;

  return (
    <View style={styles.form}>
      <TextField
        label={t("units.name")}
        value={name}
        onChangeText={setName}
        autoCapitalize="sentences"
        problem={complaintFor("name")}
      />

      <OptionList
        label={t("units.kind")}
        value={kind}
        options={kindChoices(t).map((choice) => ({
          value: choice.kind,
          label: choice.label,
        }))}
        onChange={(value) => {
          setKind(value as StorageUnitKind);
        }}
      />

      <TextField
        label={t("units.description")}
        value={description}
        onChangeText={setDescription}
        multiline
        problem={complaintFor("description")}
      />

      <Button
        tone="primary"
        block
        disabled={busy}
        label={submitLabel}
        onPress={() => {
          onSubmit({
            name,
            kind,
            // Absent and empty are different requests: `null` is the only way
            // to take a description OFF (ADR 14).
            description: description.trim() === "" ? null : description,
          });
        }}
      >
        {submitLabel}
      </Button>
    </View>
  );
};

const styles = StyleSheet.create({
  form: { gap: space.s4 },
});
