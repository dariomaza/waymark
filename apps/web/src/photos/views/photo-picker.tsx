import { useId, type JSX } from "react";

import "./photo-picker.css";
import { useTranslate } from "../../app/language-context.js";

export interface PhotoPickerProps {
  readonly label: string;
  readonly busy: boolean;
  readonly onPick: (file: File) => void;
}

/**
 * Presentational. A file input dressed as a button.
 *
 * `capture="environment"` asks a phone for the back camera directly, which is
 * the one pointed at the box. It is a hint, not a demand: a laptop ignores it
 * and opens a file picker, which is exactly right there.
 */
export const PhotoPicker = ({ label, busy, onPick }: PhotoPickerProps): JSX.Element => {
  const t = useTranslate();

  const id = useId();

  return (
    <label className="photo-picker" htmlFor={id}>
      <span className="photo-picker__label">{busy ? t("photos.uploading") : label}</span>
      <input
        className="photo-picker__input"
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file !== undefined) {
            onPick(file);
          }
          // Cleared so picking the same file twice fires again.
          event.target.value = "";
        }}
      />
    </label>
  );
};
