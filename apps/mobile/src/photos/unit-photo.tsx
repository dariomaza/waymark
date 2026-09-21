import { describeFailure, type StorageUnitView } from "@ariadna/api-client";
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
 * The URL is built here rather than taken from the answer, which is the one
 * place in either client that still has to: `StorageUnitView` hands out a bare
 * `photoId` and not a photo view. The README names this as the last asymmetry
 * left in the contract; the day it goes, this line goes with it.
 */
const photoUrl = (id: string): string => `/photos/${encodeURIComponent(id)}`;

export const UnitPhoto = ({ unit }: { readonly unit: StorageUnitView }): JSX.Element => {
  const upload = useUploadUnitPhoto(unit.id);
  const remove = useDeleteUnitPhoto(unit.id);

  return (
    <View style={styles.wrap}>
      {unit.photoId === null ? null : (
        <AuthenticatedImage
          src={photoUrl(unit.photoId)}
          alt={`Photo of ${unit.name}`}
          size={160}
        />
      )}

      <PhotoPicker
        busy={upload.isPending}
        onPick={(photo) => {
          upload.mutate(photo);
        }}
      />

      {unit.photoId === null ? null : (
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
