import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useState, type JSX } from "react";
import { StyleSheet, View } from "react-native";

import type { RootStackParamList } from "../app/navigation.js";
import { Button } from "../ui/atoms/button.js";
import { Loading } from "../ui/atoms/loading.js";
import { ScreenTitle } from "../ui/atoms/screen-title.js";
import { EmptyNote } from "../ui/molecules/empty-note.js";
import { FailureNote } from "../ui/molecules/failure-note.js";
import { Screen } from "../ui/organisms/screen.js";
import { space } from "../ui/styles/tokens.js";
import { CreateUnitSheet } from "./create-unit-sheet.js";
import { useStorageUnitTree } from "./unit-queries.js";
import { UnitTree } from "./views/unit-tree.js";
import { useTranslate } from "../app/language-context.js";

/**
 * Container. The whole house, as the forest the API answers with.
 *
 * It owns the request and the three states it can be in; everything it draws
 * when the request worked is one presentational component away.
 */
export const InventoryScreen = (): JSX.Element => {
  const t = useTranslate();

  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const tree = useStorageUnitTree();
  const [adding, setAdding] = useState(false);

  return (
    <Screen>
      <ScreenTitle>{t("inventory.title")}</ScreenTitle>

      {tree.isPending ? <Loading label={t("inventory.loading")} /> : null}

      {tree.isError ? (
        <FailureNote
          error={tree.error}
          title={t("inventory.failed")}
          onRetry={() => {
            void tree.refetch();
          }}
        />
      ) : null}

      {tree.isSuccess ? (
        <>
          {/*
            Two controls, on one line — "quería que fueran dos botones en
            línea". The primary is still the primary: it is the only lime
            rectangle on the screen and it comes first, which is what ADR 21
            asks of a screen's one primary. What it no longer does is take the
            whole width and leave the other errand somewhere else entirely —
            this client had no way to a sheet of labels at all until now.

            `share` on both is what keeps the two rectangles the same width and
            the same HEIGHT once a Spanish label wraps to two lines; the browser
            gets the same thing from a grid of two tracks. See the atom.
          */}
          <View style={styles.actions}>
            <Button
              tone="primary"
              icon="plus"
              share
              onPress={() => {
                setAdding(true);
              }}
            >
              {t("inventory.addSpace")}
            </Button>
            <Button
              icon="tags"
              share
              onPress={() => {
                navigation.navigate("Labels");
              }}
            >
              {t("label.sheet")}
            </Button>
          </View>

          {tree.data.tree.length === 0 ? (
            <EmptyNote explains={t("inventory.emptyExplains")}>
              {t("inventory.emptyTitle")}
            </EmptyNote>
          ) : (
            <UnitTree
              nodes={tree.data.tree}
              onOpen={(id) => {
                navigation.navigate("Unit", { id });
              }}
            />
          )}
        </>
      ) : null}

      {adding ? (
        <CreateUnitSheet
          parentId={null}
          parentName={null}
          onClose={() => {
            setAdding(false);
          }}
        />
      ) : null}
    </Screen>
  );
};

const styles = StyleSheet.create({
  /**
   * `alignItems: "stretch"` is React Native's default for a row and is stated
   * anyway, because it is what makes the two rectangles the same height and it
   * is exactly the line somebody removes while tidying.
   */
  actions: { flexDirection: "row", alignItems: "stretch", gap: space.s2 },
});
