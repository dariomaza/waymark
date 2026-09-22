import type { FieldComplaint } from "@waymark/i18n";
import { useState, type JSX } from "react";
import { StyleSheet, View } from "react-native";

import { Button } from "../../ui/atoms/button.js";
import { TextField } from "../../ui/atoms/text-field.js";
import { space } from "../../ui/styles/tokens.js";
import { useTranslate } from "../../app/language-context.js";

export interface ItemFormValues {
  readonly name: string;
  readonly description: string | null;
  readonly quantity: number;
  readonly tags: readonly string[];
}

export interface ItemFormProps {
  readonly initial: ItemFormValues;
  readonly submitLabel: string;
  readonly busy: boolean;
  readonly complaints: readonly FieldComplaint[];
  readonly onSubmit: (values: ItemFormValues) => void;
}

/**
 * Presentational.
 *
 * The quantity is sent as whatever was typed, parsed but not judged: `0` is a
 * number the transport accepts and the DOMAIN refuses, as `InvalidQuantity`,
 * which comes back as a 422 (ADR 8). Restating "at least one" here would be a
 * second copy of an invariant, and the copy that is wrong is always the one in
 * the client.
 *
 * Tags are the COMPLETE list every time. A revision that could only add would
 * leave no way to remove the one that was a typo.
 */
export const ItemForm = ({
  initial,
  submitLabel,
  busy,
  complaints,
  onSubmit,
}: ItemFormProps): JSX.Element => {
  const t = useTranslate();

  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? "");
  const [quantity, setQuantity] = useState(String(initial.quantity));
  const [tags, setTags] = useState(initial.tags.join(", "));

  const complaintFor = (field: string): string | null =>
    complaints.find((complaint) => complaint.field === field)?.message ?? null;

  return (
    <View style={styles.form}>
      <TextField
        label={t("items.name")}
        value={name}
        onChangeText={setName}
        problem={complaintFor("name")}
      />
      <TextField
        label={t("items.description")}
        value={description}
        onChangeText={setDescription}
        multiline
        problem={complaintFor("description")}
      />
      <TextField
        label={t("items.quantity")}
        value={quantity}
        onChangeText={setQuantity}
        keyboardType="number-pad"
        problem={complaintFor("quantity")}
      />
      <TextField
        label={t("items.tags")}
        hint={t("items.tagsHintPhone")}
        value={tags}
        onChangeText={setTags}
        autoCapitalize="none"
        problem={complaintFor("tags")}
      />

      <Button
        tone="primary"
        block
        disabled={busy}
        label={submitLabel}
        onPress={() => {
          onSubmit({
            name,
            description: description.trim() === "" ? null : description,
            quantity: Number(quantity),
            tags: tags
              .split(",")
              .map((tag) => tag.trim())
              .filter((tag) => tag !== ""),
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
