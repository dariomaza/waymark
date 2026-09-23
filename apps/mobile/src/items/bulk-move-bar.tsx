import type { ItemId } from "@waymark/domain";
import { useState, type JSX } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "../ui/atoms/button.js";
import { colors, space, text } from "../ui/styles/tokens.js";
import { MoveItemsSheet } from "./move-items-sheet.js";
import { useTranslate } from "../app/language-context.js";

export interface BulkMoveBarProps {
  readonly itemIds: readonly ItemId[];
  /** Leaves picking mode. Both buttons here end up in it. */
  readonly onDone: () => void;
}

/**
 * # The bar that says what picking mode is for
 *
 * Emptying a box one thing at a time is the chore ADR 3 set out to avoid, and
 * on a phone the selection has nowhere to live but a bar pinned under the
 * grid — where a thumb already is, and where it does not scroll away from
 * somebody who has picked six things and is still scrolling for the seventh.
 *
 * It appears the moment picking starts rather than the moment something is
 * ticked, because the empty state is the one that has something to teach: the
 * sentence in it is where the long-press gesture is learnt by somebody who
 * arrived through the button. Once anything is ticked the sentence has done
 * its job and the count takes the space.
 */
export const BulkMoveBar = ({ itemIds, onDone }: BulkMoveBarProps): JSX.Element => {
  const t = useTranslate();

  const [open, setOpen] = useState(false);
  const count = itemIds.length;

  return (
    <View style={styles.bar}>
      {count === 0 ? (
        <Text style={styles.hint}>{t("items.pickingHint")}</Text>
      ) : (
        <Button
          tone="primary"
          label={t("items.moveCount", { count })}
          onPress={() => {
            setOpen(true);
          }}
        >
          {t("items.moveCount", { count })}
        </Button>
      )}

      <Button tone="quiet" label={t("action.clearSelection")} onPress={onDone}>
        {t("action.clearSelection")}
      </Button>

      {open ? (
        <MoveItemsSheet
          itemIds={itemIds}
          title={t("items.moveCount", { count })}
          onMoved={onDone}
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: space.s2,
    paddingTop: space.s3,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  hint: { color: colors.inkMuted, fontSize: text.s, flexShrink: 1, lineHeight: 18 },
});
