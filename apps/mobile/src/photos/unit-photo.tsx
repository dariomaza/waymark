import {
  describeFailure,
  photoStatusNote,
  type StorageUnitWithPhotoView,
} from "@ariadna/api-client";
import type { JSX } from "react";
import { StyleSheet, View } from "react-native";

import { Button } from "../ui/atoms/button.js";
import { Callout } from "../ui/atoms/callout.js";
import { space } from "../ui/styles/tokens.js";
import { AuthenticatedImage } from "./authenticated-image.js";
import { useDeleteUnitPhoto, useUploadUnitPhoto } from "./photo-mutations.js";
import { PhotoPicker } from "./views/photo-picker.js";

/**
 * A unit holds exactly one photo, so uploading is always a replacement and the
 * API releases the file the old one pointed at.
 *
 * The URL comes from the answer. A unit used to hand out a bare `photoId` and
 * this was the last place in either client that had to build `/photos/<id>`
 * by hand; the unit now carries its whole photo, so the line is gone and the
 * screen can say what state the picture is in.
 */
export const UnitPhoto = ({
  unit,
}: {
  readonly unit: StorageUnitWithPhotoView;
}): JSX.Element => {
  const upload = useUploadUnitPhoto(unit.id);
  const remove = useDeleteUnitPhoto(unit.id);
  const photo = unit.photo;
  const note = photo === null ? null : photoStatusNote(photo.processingStatus);

  return (
    <View style={styles.wrap}>
      {photo === null ? null : (
        <AuthenticatedImage src={photo.url} alt={`Photo of ${unit.name}`} size={160} />
      )}

      {note === null ? null : <Callout tone="note">{note}</Callout>}

      <PhotoPicker
        busy={upload.isPending}
        onPick={(picked) => {
          upload.mutate(picked);
        }}
      />

      {photo === null ? null : (
        <Button
          tone="quiet"
          label="Remove this photo"
          onPress={() => {
            remove.mutate();
          }}
        >
          Remove this photo
        </Button>
      )}

      {upload.isError ? (
        <Callout tone="wrong">{describeFailure(upload.error)}</Callout>
      ) : null}
      {remove.isError ? (
        <Callout tone="wrong">{describeFailure(remove.error)}</Callout>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: space.s2, alignItems: "flex-start" },
});
