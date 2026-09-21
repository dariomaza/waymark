import {
  describeFailure,
  photoStatusNote,
  type StorageUnitWithPhotoView,
} from "@ariadna/api-client";
import type { JSX } from "react";

import { Button } from "../ui/atoms/button.js";
import { Callout } from "../ui/atoms/callout.js";
import { AuthenticatedImage } from "./authenticated-image.js";
import { useDeleteUnitPhoto, useUploadUnitPhoto } from "./photo-mutations.js";
import { PhotoPicker } from "./views/photo-picker.js";
import "./unit-photo.css";

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
  const upload = useUploadUnitPhoto(unit.id);
  const remove = useDeleteUnitPhoto(unit.id);
  const photo = unit.photo;
  const note = photo === null ? null : photoStatusNote(photo.processingStatus);

  return (
    <section className="unit-photo">
      {photo === null ? null : (
        <AuthenticatedImage src={photo.url} alt={`Photo of ${unit.name}`} />
      )}

      {note === null ? null : <Callout tone="note">{note}</Callout>}

      <div className="unit-photo__controls">
        <PhotoPicker
          label={photo === null ? "Add a photo" : "Replace the photo"}
          busy={upload.isPending}
          onPick={(file) => {
            upload.mutate(file);
          }}
        />
        {photo === null ? null : (
          <Button
            disabled={remove.isPending}
            onClick={() => {
              remove.mutate();
            }}
          >
            Remove this photo
          </Button>
        )}
      </div>

      {upload.isError ? (
        <Callout tone="wrong">{describeFailure(upload.error)}</Callout>
      ) : null}
      {remove.isError ? (
        <Callout tone="wrong">{describeFailure(remove.error)}</Callout>
      ) : null}
    </section>
  );
};
