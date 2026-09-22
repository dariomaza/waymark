import { CameraView, useCameraPermissions } from "expo-camera";
import type { JSX } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "../ui/atoms/button.js";
import { colors, radius, space, text } from "../ui/styles/tokens.js";
import type { CodeScanner, CodeScannerViewProps } from "./code-scanner.js";
import { useTranslate } from "../app/language-context.js";

/**
 * The adapter. The one file that knows `expo-camera` exists.
 *
 * Permission is asked for here rather than at startup: a camera permission
 * prompt on first launch, before the person has seen what the app is for, is
 * the one most people decline. Saying no is a normal answer, so it is a
 * sentence with a button and never a dead screen — the code printed under the
 * symbol is typed in instead, which is why it is printed there.
 */
const ExpoCameraView = ({ onCode }: CodeScannerViewProps): JSX.Element => {
  const t = useTranslate();

  const [permission, requestPermission] = useCameraPermissions();

  if (permission == null) {
    return <View style={styles.frame} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.frame}>
        <Text style={styles.message}>
          Ariadna needs permission to use the camera to read a label. The code printed
          under the symbol works just as well.
        </Text>
        <Button
          tone="primary"
          onPress={() => {
            void requestPermission();
          }}
        >
          {t("scan.allowCamera")}
        </Button>
      </View>
    );
  }

  return (
    <CameraView
      accessibilityLabel={t("scan.camera")}
      style={styles.camera}
      facing="back"
      barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
      onBarcodeScanned={({ data }) => {
        onCode(data);
      }}
    />
  );
};

export const expoCameraScanner = (): CodeScanner => ({ View: ExpoCameraView });

const styles = StyleSheet.create({
  camera: { height: 320, borderRadius: radius.m, overflow: "hidden" },
  frame: {
    height: 320,
    borderRadius: radius.m,
    backgroundColor: colors.surfaceSunken,
    justifyContent: "center",
    alignItems: "flex-start",
    padding: space.s4,
    gap: space.s3,
  },
  message: { color: colors.ink, fontSize: text.m, lineHeight: 22 },
});
