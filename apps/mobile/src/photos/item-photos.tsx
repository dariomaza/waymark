import {
  describeFailure,
  detailNumber,
  movedEarlier,
  photoStatusNote,
  tooManyPhotosMessage,
  withCoverFirst,
  type ItemView,
} from "@ariadna/api-client";
import { MAX_ITEM_PHOTOS } from "@ariadna/domain";
import type { JSX } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "../ui/atoms/button.js";
import { Callout } from "../ui/atoms/callout.js";
import { colors, space, text } from "../ui/styles/tokens.js";
import { AuthenticatedImage } from "./authenticated-image.js";
import {
  useDeleteItemPhoto,
  useReorderItemPhotos,
  useUploadItemPhoto,
} from "./photo-mutations.js";
import { PhotoPicker } from "./views/photo-picker.js";

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
  const upload = useUploadItemPhoto(item.id);
  const reorder = useReorderItemPhotos(item.id);
  const remove = useDeleteItemPhoto(item.id);

  const full = tooManyPhotosMessage(
    upload.error,
    detailNumber(upload.error, "limit") ?? MAX_ITEM_PHOTOS,
  );
  const order = item.photos.map((photo) => photo.id);

  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.heading}>
        Photos
      </Text>

      <PhotoPicker
        busy={upload.isPending}
        onPick={(photo) => {
          upload.mutate(photo);
        }}
      />

      {upload.isError ? (
        <Callout tone={full === null ? "wrong" : "blocked"}>
          {full ?? describeFailure(upload.error)}
        </Callout>
      ) : null}

      {item.photos.length === 0 ? null : (
        <View style={styles.grid} accessibilityLabel="Photos">
          {item.photos.map((photo, index) => {
            const note = photoStatusNote(photo.processingStatus);

            return (
              <View key={photo.id} style={styles.cell}>
                <AuthenticatedImage
                  src={photo.thumbnailUrl}
                  alt={
                    index === 0
                      ? `Cover photo of ${item.name}`
                      : `Photo ${String(index + 1)} of ${item.name}`
                  }
                />
                {note === null ? null : <Text style={styles.note}>{note}</Text>}
                <View style={styles.controls}>
                  {index === 0 ? (
                    <Text style={styles.cover}>Cover</Text>
                  ) : (
                    <>
                      <Button
                        tone="quiet"
                        label={`Make photo ${index + 1} the cover`}
                        onPress={() => {
                          reorder.mutate(withCoverFirst(order, photo.id));
                        }}
                      >
                        {`Make photo ${index + 1} the cover`}
                      </Button>
                      <Button
                        tone="quiet"
                        label={`Move photo ${index + 1} earlier`}
                        onPress={() => {
                          reorder.mutate(movedEarlier(order, photo.id));
                        }}
                      >
                        {`Move photo ${index + 1} earlier`}
                      </Button>
                    </>
                  )}
                  <Button
                    tone="quiet"
                    label={`Delete photo ${index + 1}`}
                    onPress={() => {
                      remove.mutate(photo.id);
                    }}
                  >
                    {`Delete photo ${index + 1}`}
                  </Button>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {reorder.isError ? (
        <Callout tone="wrong">{describeFailure(reorder.error)}</Callout>
      ) : null}
      {remove.isError ? (
        <Callout tone="wrong">{describeFailure(remove.error)}</Callout>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  section: { gap: space.s3 },
  heading: { color: colors.ink, fontSize: text.l, fontWeight: "700" },
  grid: { gap: space.s3 },
  cell: { gap: space.s2 },
  note: { color: colors.inkMuted, fontSize: text.s, lineHeight: 20 },
  controls: { flexDirection: "row", flexWrap: "wrap", gap: space.s2 },
  cover: { color: colors.accent, fontSize: text.s, fontWeight: "700" },
});
