import type { FieldComplaint } from "@waymark/i18n";
import { useState, type FormEvent, type JSX } from "react";

import { Button } from "../../ui/atoms/button.js";
import { Callout, type CalloutTone } from "../../ui/atoms/callout.js";
import { TextArea } from "../../ui/atoms/text-area.js";
import { TextField } from "../../ui/atoms/text-field.js";
import { useTranslate } from "../../app/language-context.js";

export interface ItemFormValues {
  readonly name: string;
  readonly description: string;
  readonly quantity: number;
  readonly tags: readonly string[];
}

export interface ItemFormProps {
  readonly submitLabel: string;
  /** Empty when adding, what the item currently says when editing. */
  readonly initial: ItemFormValues;
  readonly busy: boolean;
  readonly failure: string | null;
  /** `blocked` for a refusal about the world, `wrong` about the request (ADR 8). */
  readonly failureTone?: CalloutTone;
  readonly fieldProblems: readonly FieldComplaint[];
  readonly onSubmit: (values: ItemFormValues) => void;
}

/**
 * Presentational.
 *
 * `quantity` is sent as whatever was typed, including a zero. The domain
 * decides what a quantity may be and answers `InvalidQuantity`; checking it
 * here would be a second copy of a rule that lives in one place on purpose,
 * and the API's own sentence is what the person ends up reading either way.
 *
 * Tags are typed as a comma separated line, because the whole point of a tag
 * is that it is faster than a form. Searching `cables` finds an item called
 * `HDMI 2.1` only if somebody could be bothered to write the tag.
 */
export const ItemForm = ({
  submitLabel,
  initial,
  busy,
  failure,
  failureTone = "wrong",
  fieldProblems,
  onSubmit,
}: ItemFormProps): JSX.Element => {
  const t = useTranslate();

  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [quantity, setQuantity] = useState(String(initial.quantity));
  // A comma separated line, which is also how they are read back out.
  const [tags, setTags] = useState(initial.tags.join(", "));

  const complaintFor = (field: string): string | undefined =>
    fieldProblems.find((problem) => problem.field === field)?.message;

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onSubmit({
      name,
      description,
      quantity: Number(quantity),
      tags: tags
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag !== ""),
    });
  };

  return (
    <form onSubmit={submit} noValidate>
      <div className="sheet__body">
        {failure === null ? null : <Callout tone={failureTone}>{failure}</Callout>}

        <TextField
          id="item-name"
          label={t("items.name")}
          required
          autoFocus
          value={name}
          error={complaintFor("name")}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />

        <TextField
          id="item-quantity"
          label={t("items.quantity")}
          type="number"
          inputMode="numeric"
          value={quantity}
          error={complaintFor("quantity")}
          onChange={(event) => {
            setQuantity(event.target.value);
          }}
        />

        <TextField
          id="item-tags"
          label={t("items.tags")}
          hint={t("items.tagsHint")}
          value={tags}
          error={complaintFor("tags")}
          onChange={(event) => {
            setTags(event.target.value);
          }}
        />

        <TextArea
          id="item-description"
          label={t("items.description")}
          hint={t("action.optional")}
          value={description}
          error={complaintFor("description")}
          onChange={(event) => {
            setDescription(event.target.value);
          }}
        />

        <div className="sheet__commit">
          <Button type="submit" tone="primary" disabled={busy}>
            {busy ? t("action.saving") : submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
};
