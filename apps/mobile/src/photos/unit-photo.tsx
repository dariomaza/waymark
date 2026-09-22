import { type StorageUnitWithPhotoView } from "@waymark/api-client";
import { describeFailure } from "@waymark/i18n";
import type { JSX } from "react";
import { StyleSheet, View } from "react-native";

import { Button } from "../ui/atoms/button.js";
import { Callout } from "../ui/atoms/callout.js";
import { space } from "../ui/styles/tokens.js";
import { AuthenticatedImage } from "./authenticated-image.js";
import {
  useDeleteUnitPhoto,
  useReprocessPhoto,
  useUploadUnitPhoto,
} from "./photo-mutations.js";
import { PhotoPicker } from "./views/photo-picker.js";
import { PhotoStatusNote } from "./views/photo-status-note.js";
import { useTranslate } from "../app/language-context.js";

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
  const t = useTranslate();

  const upload = useUploadUnitPhoto(unit.id);
  const remove = useDeleteUnitPhoto(unit.id);
  const reprocess = useReprocessPhoto();
  const photo = unit.photo;

  return (
    <View style={styles.wrap}>
      {photo === null ? null : (
        <AuthenticatedImage src={photo.url} alt={`Photo of ${unit.name}`} size={160} />
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

      <PhotoPicker
        busy={upload.isPending}
        onPick={(picked) => {
          upload.mutate(picked);
        }}
      />

      {photo === null ? null : (
        <Button
          tone="quiet"
          label={t("photos.remove")}
          onPress={() => {
            remove.mutate();
          }}
        >
          {t("photos.remove")}
        </Button>
      )}

      {upload.isError ? (
        <Callout tone="wrong">{t(describeFailure(upload.error))}</Callout>
      ) : null}
      {remove.isError ? (
        <Callout tone="wrong">{t(describeFailure(remove.error))}</Callout>
      ) : null}
      {reprocess.isError ? (
        <Callout tone="wrong">{t(describeFailure(reprocess.error))}</Callout>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: space.s2, alignItems: "flex-start" },
});
