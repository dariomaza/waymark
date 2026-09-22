import { type ItemView } from "@waymark/api-client";
import { describeFailure } from "@waymark/i18n";
import type { JSX } from "react";
import { StyleSheet, Text } from "react-native";

import { Button } from "../ui/atoms/button.js";
import { Callout } from "../ui/atoms/callout.js";
import { Sheet } from "../ui/organisms/sheet.js";
import { colors, text } from "../ui/styles/tokens.js";
import { useDeleteItem } from "./item-mutations.js";
import { useTranslate } from "../app/language-context.js";

/**
 * Deleting an item is unconditional — unlike a unit, an item holds nothing
 * (ADR 3) — but it takes its photos with it, and those files are gone.
 */
export const DeleteItemSheet = ({
  item,
  onClose,
  onDeleted,
}: {
  readonly item: ItemView;
  readonly onClose: () => void;
  readonly onDeleted: () => void;
}): JSX.Element => {
  const t = useTranslate();

  const remove = useDeleteItem(item.id);

  return (
    <Sheet title={t("sheet.delete", { name: item.name })} onClose={onClose}>
      <Text style={styles.text}>
        {item.photos.length === 0
          ? t("items.deleteUndoneAlone", { name: item.name })
          : t("items.deleteWithPhotos", { count: item.photos.length, name: item.name })}
      </Text>

      {remove.isError ? (
        <Callout tone="wrong">{t(describeFailure(remove.error))}</Callout>
      ) : null}

      <Button
        tone="danger"
        block
        disabled={remove.isPending}
        label={t("items.delete")}
        onPress={() => {
          remove.mutate(undefined, { onSuccess: onDeleted });
        }}
      >
        {t("items.delete")}
      </Button>
    </Sheet>
  );
};

const styles = StyleSheet.create({
  text: { color: colors.ink, fontSize: text.m, lineHeight: 22 },
});
