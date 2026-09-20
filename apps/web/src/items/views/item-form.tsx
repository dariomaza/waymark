import { useState, type FormEvent, type JSX } from "react";

import { Button } from "../../ui/atoms/button.js";
import { Callout, type CalloutTone } from "../../ui/atoms/callout.js";
import { TextArea } from "../../ui/atoms/text-area.js";
import { TextField } from "../../ui/atoms/text-field.js";
import type { FieldComplaint } from "../../units/unit-messages.js";

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
  readonly onCancel: () => void;
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
  onCancel,
}: ItemFormProps): JSX.Element => {
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
          label="Name"
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
          label="Quantity"
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
          label="Tags"
          hint="Separated by commas. A tag is how you find a thing whose name you have forgotten."
          value={tags}
          error={complaintFor("tags")}
          onChange={(event) => {
            setTags(event.target.value);
          }}
        />

        <TextArea
          id="item-description"
          label="Description"
          hint="Optional."
          value={description}
          error={complaintFor("description")}
          onChange={(event) => {
            setDescription(event.target.value);
          }}
        />

        <div className="sheet__buttons">
          <Button onClick={onCancel}>Cancel</Button>
          <Button type="submit" tone="primary" disabled={busy}>
            {busy ? "Saving…" : submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
};
