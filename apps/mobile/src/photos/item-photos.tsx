import { type ItemView, detailNumber, movedEarlier, withCoverFirst } from "@waymark/api-client";
import { describeFailure, tooManyPhotosMessage } from "@waymark/i18n";
import { MAX_ITEM_PHOTOS } from "@waymark/domain";
import type { JSX } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "../ui/atoms/button.js";
import { Callout } from "../ui/atoms/callout.js";
import { colors, space, text } from "../ui/styles/tokens.js";
import { AuthenticatedImage } from "./authenticated-image.js";
import {
  useDeleteItemPhoto,
  useReorderItemPhotos,
  useReprocessPhoto,
  useUploadItemPhoto,
} from "./photo-mutations.js";
import { PhotoPicker } from "./views/photo-picker.js";
import { PhotoStatusNote } from "./views/photo-status-note.js";
import { useTranslate } from "../app/language-context.js";

export interface ItemPhotosProps {
  readonly item: ItemView;
}

/**
 * # An item's photos
 *
 * Ordered, first one is the cover, and the order is the only thing that says
 * so (ADR 9) — which is why "make this the cover" is a reorder and not a
 * field being set.
 *
 * Nothing here waits on background removal. A photo is uploaded, stored and
 * served from its original immediately; a sidecar may replace those bytes
 * later, or may not exist at all (ADR 4). What the screen says about that is
 * a quiet line under the photo it concerns, and only for the two states that
 * are news.
 *
 * Every URL comes from the API. `ItemView.photos` carries whole photos, so
 * nothing here builds `/photos/<id>` out of an id and hopes the route has not
 * moved.
 */
export const ItemPhotos = ({ item }: ItemPhotosProps): JSX.Element => {
  const t = useTranslate();

  const upload = useUploadItemPhoto(item.id);
  const reorder = useReorderItemPhotos(item.id);
  const remove = useDeleteItemPhoto(item.id);
  const reprocess = useReprocessPhoto();

  const full = t(tooManyPhotosMessage(
    upload.error,
    detailNumber(upload.error, "limit") ?? MAX_ITEM_PHOTOS,
  ));
  const order = item.photos.map((photo) => photo.id);

  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.heading}>
        {t("photos.title")}
      </Text>

      <PhotoPicker
        busy={upload.isPending}
        onPick={(photo) => {
          upload.mutate(photo);
        }}
      />

      {upload.isError ? (
        <Callout tone={full === null ? "wrong" : "blocked"}>
          {full ?? t(describeFailure(upload.error))}
        </Callout>
      ) : null}

      {item.photos.length === 0 ? null : (
        <View style={styles.grid} accessibilityLabel={t("photos.title")}>
          {item.photos.map((photo, index) => (
              <View key={photo.id} style={styles.cell}>
                <AuthenticatedImage
                  src={photo.thumbnailUrl}
                  alt={
                    index === 0
                      ? t("photos.coverOf", { name: item.name })
                      : t("photos.numberedOf", { index: index + 1, name: item.name })
                  }
                />
                <PhotoStatusNote
                  photo={photo}
                  retrying={reprocess.isPending}
                  onRetry={() => {
                    reprocess.mutate(photo.id);
                  }}
                />
                <View style={styles.controls}>
                  {index === 0 ? (
                    <Text style={styles.cover}>{t("photos.cover")}</Text>
                  ) : (
                    <>
                      <Button
                        tone="quiet"
                        label={t("photos.makeCover", { index: index + 1 })}
                        onPress={() => {
                          reorder.mutate(withCoverFirst(order, photo.id));
                        }}
                      >
                        {t("photos.makeCover", { index: index + 1 })}
                      </Button>
                      <Button
                        tone="quiet"
                        label={t("photos.moveEarlier", { index: index + 1 })}
                        onPress={() => {
                          reorder.mutate(movedEarlier(order, photo.id));
                        }}
                      >
                        {t("photos.moveEarlier", { index: index + 1 })}
                      </Button>
                    </>
                  )}
                  <Button
                    tone="quiet"
                    label={t("photos.deleteNumbered", { index: index + 1 })}
                    onPress={() => {
                      remove.mutate(photo.id);
                    }}
                  >
                    {t("photos.deleteNumbered", { index: index + 1 })}
                  </Button>
                </View>
              </View>
            ))}
        </View>
      )}

      {reorder.isError ? (
        <Callout tone="wrong">{t(describeFailure(reorder.error))}</Callout>
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
  section: { gap: space.s3 },
  heading: { color: colors.ink, fontSize: text.l, fontWeight: "700" },
  grid: { gap: space.s3 },
  cell: { gap: space.s2 },
  controls: { flexDirection: "row", flexWrap: "wrap", gap: space.s2 },
  cover: { color: colors.accent, fontSize: text.s, fontWeight: "700" },
});
