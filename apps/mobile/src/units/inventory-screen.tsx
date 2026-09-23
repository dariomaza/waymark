import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useState, type JSX } from "react";

import type { RootStackParamList } from "../app/navigation.js";
import { Button } from "../ui/atoms/button.js";
import { Loading } from "../ui/atoms/loading.js";
import { ScreenTitle } from "../ui/atoms/screen-title.js";
import { EmptyNote } from "../ui/molecules/empty-note.js";
import { FailureNote } from "../ui/molecules/failure-note.js";
import { Screen } from "../ui/organisms/screen.js";
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
          <Button
            tone="primary"
            icon="plus"
            onPress={() => {
              setAdding(true);
            }}
          >
            {t("inventory.addUnit")}
          </Button>

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
