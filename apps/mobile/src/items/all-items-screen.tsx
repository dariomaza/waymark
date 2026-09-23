import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { JSX } from "react";
import { StyleSheet, View } from "react-native";

import type { RootStackParamList } from "../app/navigation.js";
import { ItemCover } from "../photos/item-cover.js";
import { Button } from "../ui/atoms/button.js";
import { Loading } from "../ui/atoms/loading.js";
import { ScreenTitle } from "../ui/atoms/screen-title.js";
import { EmptyNote } from "../ui/molecules/empty-note.js";
import { FailureNote } from "../ui/molecules/failure-note.js";
import { Screen } from "../ui/organisms/screen.js";
import { space } from "../ui/styles/tokens.js";
import { BulkMoveBar } from "./bulk-move-bar.js";
import { useEveryItem } from "./item-queries.js";
import { useItemSelection } from "./use-item-selection.js";
import { ItemGrid } from "./views/item-grid.js";
import { useTranslate } from "../app/language-context.js";

/**
 * Everything you own, in one request, every card carrying where it is
 * (ADR 15).
 *
 * The order is the API's answer rather than this client's opinion, and the
 * location comes already joined — a flat list of names answers nothing in a
 * product about knowing WHERE things are.
 *
 * The card shows the BOX a thing is in and is NAMED after the whole
 * breadcrumb: a third of a phone is one short line wide, and losing the path
 * for somebody who cannot see the grid would lose the answer itself.
 */
export const AllItemsScreen = (): JSX.Element => {
  const t = useTranslate();

  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const items = useEveryItem();
  const selection = useItemSelection();

  return (
    // The grid is the scroller here; see `ItemGrid` for why that matters.
    <Screen scroll={false}>
      <ScreenTitle>{t("items.everything")}</ScreenTitle>

      {/*
        A box of screws is as likely to be picked from here as from inside a
        box, so the same mode is offered on both lists — and by the same two
        ways in, because a gesture learnt in one place that does nothing in
        the other is worse than never having offered it.
      */}
      {items.data === undefined || items.data.items.length === 0 || selection.picking ? null : (
        <Button
          onPress={() => {
            selection.start();
          }}
        >
          {t("items.selectSeveral")}
        </Button>
      )}

      {items.isPending ? <Loading label={t("items.loadingAll")} /> : null}

      {items.isError ? (
        <FailureNote
          error={items.error}
          title={t("items.listFailed")}
          onRetry={() => {
            void items.refetch();
          }}
        />
      ) : null}

      {items.isSuccess ? (
        items.data.items.length === 0 ? (
          <EmptyNote explains={t("items.emptyExplains")}>
            {t("items.emptyTitle")}
          </EmptyNote>
        ) : (
          <View style={styles.list}>
            <ItemGrid
              label={t("items.everything")}
              cells={items.data.items.map((row) => ({
                key: row.item.id,
                name: row.item.name,
                secondary: row.path.at(-1)?.name,
                quantity: row.item.quantity,
                label: selection.picking
                  ? t("units.select", { name: row.item.name })
                  : `${row.item.name}, ${row.location}`,
                photo: <ItemCover item={row.item} />,
                picking: selection.picking,
                selected: selection.isSelected(row.item.id),
                onLongPress: () => {
                  selection.toggle(row.item.id);
                },
                onPress: () => {
                  if (selection.picking) {
                    selection.toggle(row.item.id);

                    return;
                  }

                  navigation.navigate("Item", { id: row.item.id });
                },
              }))}
            />

            {selection.picking ? (
              <BulkMoveBar itemIds={selection.selected} onDone={selection.clear} />
            ) : null}
          </View>
        )
      ) : null}
    </Screen>
  );
};

const styles = StyleSheet.create({
  /** The grid keeps the height; the bar under it takes what it needs. */
  list: { flex: 1, gap: space.s3 },
});
