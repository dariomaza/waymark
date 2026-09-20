import { describeFailure, type StorageUnitView } from "@ariadna/api-client";
import type { JSX } from "react";

import { Button } from "../ui/atoms/button.js";
import { Callout } from "../ui/atoms/callout.js";
import { AuthenticatedImage } from "./authenticated-image.js";
import { useDeleteUnitPhoto, useUploadUnitPhoto } from "./photo-mutations.js";
import { photoUrl } from "./photo-urls.js";
import { PhotoPicker } from "./views/photo-picker.js";
import "./unit-photo.css";

export interface UnitPhotoProps {
  readonly unit: StorageUnitView;
}

/**
 * A storage unit holds exactly one photo, so uploading is always a
 * replacement and the API hands back the file it released. There is no order
 * to express here at all (ADR 9).
 */
export const UnitPhoto = ({ unit }: UnitPhotoProps): JSX.Element => {
  const upload = useUploadUnitPhoto(unit.id);
  const remove = useDeleteUnitPhoto(unit.id);

  return (
    <section className="unit-photo">
      {unit.photoId === null ? null : (
        <AuthenticatedImage src={photoUrl(unit.photoId)} alt={`Photo of ${unit.name}`} />
      )}

      <div className="unit-photo__controls">
        <PhotoPicker
          label={unit.photoId === null ? "Add a photo" : "Replace the photo"}
          busy={upload.isPending}
          onPick={(file) => {
            upload.mutate(file);
          }}
        />
        {unit.photoId === null ? null : (
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
