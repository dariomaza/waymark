import type { JSX } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useTranslate } from "../../app/language-context.js";
import { Button } from "../../ui/atoms/button.js";
import { Sheet } from "../../ui/organisms/sheet.js";
import { colors, space, text } from "../../ui/styles/tokens.js";

export interface BiometricUnlockSheetProps {
  /** Which way the switch is being moved. */
  readonly turningOn: boolean;
  readonly busy: boolean;
  readonly onConfirm: () => void;
  readonly onClose: () => void;
}

/**
 * # The question both directions of the switch ask
 *
 * One sheet and not two, because this is one setting: the same question asked
 * of the same thing, with a different answer to "what changes". Two files
 * would be two places to keep one sentence honest — unlike `delete` and
 * `empty`, which are genuinely different operations on a unit.
 *
 * The same bottom sheet everything else in this app asks a question with, for
 * the reason `Sheet` gives: a dialog in the middle of a phone puts its buttons
 * where a thumb cannot reach without changing grip.
 *
 * ## The OFF direction is the one that takes something away
 *
 * So its button is `danger` and its sentence names what stops working — that
 * the door goes from the sign-in screen and tomorrow morning starts with a
 * password — rather than asking whether somebody is sure. "Are you sure"
 * tells nobody anything they did not already know.
 *
 * Turning it ON is not dangerous and still asks, because the system's own
 * prompt is about to appear and the whole complaint this feature answers was
 * a fingerprint dialog nobody saw coming.
 */
export const BiometricUnlockSheet = ({
  turningOn,
  busy,
  onConfirm,
  onClose,
}: BiometricUnlockSheetProps): JSX.Element => {
  const t = useTranslate();

  return (
    <Sheet
      title={turningOn ? t("biometrics.turnOnTitle") : t("biometrics.turnOffTitle")}
      onClose={onClose}
    >
      <View style={styles.block}>
        <Text style={styles.text}>
          {turningOn ? t("biometrics.turnOnNote") : t("biometrics.turnOffNote")}
        </Text>
        <Button
          tone={turningOn ? "primary" : "danger"}
          block
          disabled={busy}
          label={turningOn ? t("biometrics.turnOn") : t("biometrics.turnOff")}
          onPress={onConfirm}
        >
          {turningOn ? t("biometrics.turnOn") : t("biometrics.turnOff")}
        </Button>
      </View>
    </Sheet>
  );
};

const styles = StyleSheet.create({
  block: { gap: space.s3 },
  text: { color: colors.ink, fontSize: text.m, lineHeight: 22 },
});
