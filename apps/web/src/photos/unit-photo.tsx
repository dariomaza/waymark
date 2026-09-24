import { type StorageUnitWithPhotoView } from "@waymark/api-client";
import { describeFailure } from "@waymark/i18n";
import type { JSX } from "react";

import { Button } from "../ui/atoms/button.js";
import { Callout } from "../ui/atoms/callout.js";
import { AuthenticatedImage } from "./authenticated-image.js";
import {
  useDeleteUnitPhoto,
  useReprocessPhoto,
  useUploadUnitPhoto,
} from "./photo-mutations.js";
import { uploadFailureMessage } from "./readable-photo.js";
import { PhotoPicker } from "./views/photo-picker.js";
import { PhotoStatusNote } from "./views/photo-status-note.js";
import "./unit-photo.css";
import { useTranslate } from "../app/language-context.js";

export interface UnitPhotoProps {
  readonly unit: StorageUnitWithPhotoView;
}

/**
 * A storage unit holds exactly one photo, so uploading is always a
 * replacement and the API hands back the file it released. There is no order
 * to express here at all (ADR 9).
 *
 * Every URL comes from the API. The unit carries its whole photo now rather
 * than an id, so nothing here builds `/photos/<id>` and hopes the route has
 * not moved — and the screen can say which state the picture is in, which an
 * id could never have told it.
 */
export const UnitPhoto = ({ unit }: UnitPhotoProps): JSX.Element => {
  const t = useTranslate();

  const upload = useUploadUnitPhoto(unit.id);
  const remove = useDeleteUnitPhoto(unit.id);
  const reprocess = useReprocessPhoto();
  const photo = unit.photo;

  return (
    <section className="unit-photo">
      {photo === null ? null : (
        <AuthenticatedImage src={photo.url} alt={t("photos.photoOf", { name: unit.name })} />
      )}

      {photo === null ? null : (
        <PhotoStatusNote
          photo={photo}
          retrying={reprocess.isPending}
          onRetry={() => {
            reprocess.mutate(photo.id);
          }}
        />
      )}

      <div className="unit-photo__controls">
        <PhotoPicker
          label={photo === null ? t("photos.add") : t("photos.replace")}
          busy={upload.isPending}
          onPick={(file) => {
            upload.mutate(file);
          }}
        />
        {photo === null ? null : (
          <Button
            icon="trash"
            disabled={remove.isPending}
            onClick={() => {
              remove.mutate();
            }}
          >
            {t("photos.remove")}
          </Button>
        )}
      </div>

      {upload.isError ? (
        <Callout tone="wrong">{t(uploadFailureMessage(upload.error))}</Callout>
      ) : null}
      {remove.isError ? (
        <Callout tone="wrong">{t(describeFailure(remove.error))}</Callout>
      ) : null}
      {reprocess.isError ? (
        <Callout tone="wrong">{t(describeFailure(reprocess.error))}</Callout>
      ) : null}
    </section>
  );
};
