import { publicIdFromScannedText } from "@waymark/api-client";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useState, type JSX } from "react";
import { StyleSheet, View } from "react-native";

import type { RootStackParamList } from "../app/navigation.js";
import { Button } from "../ui/atoms/button.js";
import { Callout } from "../ui/atoms/callout.js";
import { ScreenTitle } from "../ui/atoms/screen-title.js";
import { TextField } from "../ui/atoms/text-field.js";
import { Screen } from "../ui/organisms/screen.js";
import { space } from "../ui/styles/tokens.js";
import { useScanner } from "./scanner-context.js";
import { useTranslate } from "../app/language-context.js";

/**
 * # The first thing the app shows
 *
 * This is the reason the product exists: a printed QR on a box, a phone
 * pointed at it, and the inside of the box on the screen. It is the first tab
 * and it opens with the camera already live, because every tap between
 * launching the app and being able to scan is a tap taken one-handed in a
 * garage while holding something.
 *
 * Whatever is decoded goes through the same front door as a label opened from
 * the stock camera — the `ScannedLabel` screen — so there is exactly one place
 * that turns a code into a unit.
 */
export const ScanScreen = (): JSX.Element => {
  const t = useTranslate();

  const scanner = useScanner();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [unknownCode, setUnknownCode] = useState<string | null>(null);
  const [typed, setTyped] = useState("");

  const open = (text: string): void => {
    const code = publicIdFromScannedText(text);
    if (code === null) {
      setUnknownCode(text);

      return;
    }

    setUnknownCode(null);
    navigation.navigate("ScannedLabel", { publicId: code });
  };

  return (
    <Screen>
      <ScreenTitle>{t("scan.title")}</ScreenTitle>

      <scanner.View onCode={open} />

      {unknownCode === null ? null : (
        <Callout tone="wrong">
          That is not an Ariadna label. A label points at this app and ends in a ten
          character code.
        </Callout>
      )}

      <View style={styles.byHand}>
        <TextField
          label={t("scan.typedCode")}
          value={typed}
          onChangeText={setTyped}
          autoCapitalize="characters"
          autoCorrect={false}
        />
        <Button
          tone="primary"
          block
          label={t("scan.openUnit")}
          onPress={() => {
            open(typed);
          }}
        >
          {t("scan.openUnit")}
        </Button>
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  byHand: { gap: space.s3 },
});
