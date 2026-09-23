import type { JSX, ReactNode } from "react";
import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";

import { Button } from "../atoms/button.js";
import { colors, radius, space, text } from "../styles/tokens.js";
import { useTranslate } from "../../app/language-context.js";

export interface SheetProps {
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

/**
 * A panel that slides up from the bottom of the screen.
 *
 * Bottom, not centre: a dialog in the middle of a phone puts its buttons
 * where the thumb cannot reach without changing grip, which on a step ladder
 * is a real cost. Everything that asks a question here — create, edit, move,
 * empty, delete — uses the same one.
 */
export const Sheet = ({ title, onClose, children }: SheetProps): JSX.Element => {
  const t = useTranslate();

  return (
    <Modal
      animationType="slide"
      transparent
      visible
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.head}>
            <Text accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
            {/*
              An X in the corner, and no word. It is one of the few shapes
              that needs no caption anywhere in the world, and the word was
              taking a button's width beside a title on a phone held in one
              hand. The NAME is not dropped with it: `label` carries the same
              dictionary word the button used to print, so a screen reader
              still says "Close, button".
            */}
            <Button
              tone="quiet"
              icon="close"
              label={t("action.close")}
              onPress={onClose}
            />
          </View>
          <ScrollView contentContainerStyle={styles.body}>{children}</ScrollView>
        </View>
      </View>
    </Modal>
);
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "#000000aa" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.l,
    borderTopRightRadius: radius.l,
    maxHeight: "90%",
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: space.s4,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  title: { color: colors.ink, fontSize: text.l, fontWeight: "700" },
  body: { padding: space.s4, gap: space.s4, paddingBottom: space.s6 },
});
