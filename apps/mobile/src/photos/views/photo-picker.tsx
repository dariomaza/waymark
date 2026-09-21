import { useState, type JSX } from "react";
import { StyleSheet, View } from "react-native";

import type { PhotoUpload } from "../../api/mobile-client.js";
import { Button } from "../../ui/atoms/button.js";
import { Callout } from "../../ui/atoms/callout.js";
import { space } from "../../ui/styles/tokens.js";
import { usePhotoSource } from "../photo-source-context.js";

export interface PhotoPickerProps {
  readonly busy: boolean;
  readonly onPick: (photo: PhotoUpload) => void;
}

/**
 * Two buttons, because a phone has two answers.
 *
 * The web client has one file input with `capture="environment"`, which is a
 * hint a browser may ignore. Android has no such ambiguity: taking a photo of
 * the thing in your hand and finding one you took last week are different
 * intents, they open different screens, and the person already knows which one
 * they want before they tap.
 *
 * A refusal of the camera permission is a sentence, not a crash — saying no is
 * a normal answer on a phone.
 */
export const PhotoPicker = ({ busy, onPick }: PhotoPickerProps): JSX.Element => {
  const source = usePhotoSource();
  const [refused, setRefused] = useState<string | null>(null);

  const ask = (open: () => Promise<PhotoUpload | null>) => (): void => {
    setRefused(null);
    void open()
      .then((photo) => {
        if (photo !== null) {
          onPick(photo);
        }
      })
      .catch((cause: unknown) => {
        setRefused(
          cause instanceof Error ? cause.message : "That photo could not be read.",
        );
      });
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.buttons}>
        <Button disabled={busy} onPress={ask(() => source.capture())} label="Take a photo">
          {busy ? "Uploading…" : "Take a photo"}
        </Button>
        <Button
          disabled={busy}
          onPress={ask(() => source.pick())}
          label="Choose a photo"
        >
          Choose a photo
        </Button>
      </View>
      {refused === null ? null : <Callout tone="blocked">{refused}</Callout>}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: space.s2 },
  buttons: { flexDirection: "row", flexWrap: "wrap", gap: space.s2 },
});
