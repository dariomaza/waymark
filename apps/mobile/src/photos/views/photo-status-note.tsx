import { type PhotoView } from "@waymark/api-client";
import { photoStatusNote } from "@waymark/i18n";
import { PhotoProcessingStatus } from "@waymark/domain";
import type { JSX } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "../../ui/atoms/button.js";
import { colors, space, text } from "../../ui/styles/tokens.js";
import { useTranslate } from "../../app/language-context.js";

export interface PhotoStatusNoteProps {
  readonly photo: PhotoView;
  /** Puts this photo back in the queue. See `useReprocessPhoto`. */
  readonly onRetry: () => void;
  readonly retrying: boolean;
}

/**
 * What a photo's processing state is worth saying, and what to do about it.
 *
 * The sentence is shared with the web PWA (`photoStatusNote`), because `DONE`
 * and `SKIPPED` are not news on either: the picture on the screen is the
 * finished article whichever way it went, and a tick on every cell of a grid
 * of ten is noise.
 *
 * `FAILED` is the only one with a button. `PENDING` is the normal state of a
 * freshly uploaded photo and may be its final one, since background removal
 * is optional and may not be installed at all (ADR 4) — offering to retry
 * something nothing has tried yet would invent a problem.
 */
export const PhotoStatusNote = ({
  photo,
  onRetry,
  retrying,
}: PhotoStatusNoteProps): JSX.Element | null => {
  const t = useTranslate();

  const note = t(photoStatusNote(photo.processingStatus));
  if (note === null) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.note}>{note}</Text>
      {photo.processingStatus === PhotoProcessingStatus.FAILED ? (
        <Button
          tone="quiet"
          label={t("photos.retryRemoval")}
          disabled={retrying}
          onPress={onRetry}
        >
          {t("photos.retryRemoval")}
        </Button>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: space.s2, alignItems: "flex-start" },
  note: { color: colors.inkMuted, fontSize: text.s, lineHeight: 20 },
});
