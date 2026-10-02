import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { rootsByWhose, type StorageUnitTreeView } from "@waymark/api-client";
import { Role } from "@waymark/domain";
import { useState, type JSX } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { RootStackParamList } from "../app/navigation.js";
import { Button } from "../ui/atoms/button.js";
import { Loading } from "../ui/atoms/loading.js";
import { ScreenTitle } from "../ui/atoms/screen-title.js";
import { EmptyNote } from "../ui/molecules/empty-note.js";
import { FailureNote } from "../ui/molecules/failure-note.js";
import { Screen } from "../ui/organisms/screen.js";
import { space, text } from "../ui/styles/tokens.js";
import { useColors } from "../ui/styles/theme.js";
import { useCaller } from "../auth/people-queries.js";
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
  const caller = useCaller();
  const [adding, setAdding] = useState(false);
  /*
    A new top-level space is refused only to a narrowed machine token (ADR
    26), and the tree says so. Not offered until the tree has said it, as in
    the browser: a guess that has to be taken back is worse than a button that
    arrives a moment late.
  */
  const mayMakeRoot = tree.data?.mayMakeRoot === true;

  return (
    <Screen>
      <ScreenTitle>{t("inventory.title")}</ScreenTitle>

      {/*
        Two controls, on one line — "quería que fueran dos botones en línea".
        The primary is still the primary: it is the only lime rectangle on the
        screen and it comes first, which is what ADR 21 asks of a screen's one
        primary. What it no longer does is take the whole width and leave the
        other errand somewhere else entirely — this client had no way to a sheet
        of labels at all until now.

        `share` on both is what keeps the two rectangles the same width and the
        same HEIGHT once a Spanish label wraps to two lines; the browser gets
        the same thing from a grid of two tracks. See the atom.

        It sits ABOVE the three states of the request rather than inside the
        one where it worked. The row is what this screen is FOR, and drawing it
        only once the tree had arrived meant a bad connection left the home
        screen offering nothing at all — which the browser never did.
      */}
      <View style={styles.actions}>
        {mayMakeRoot ? (
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
        ) : null}
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
          {tree.data.tree.length === 0 ? (
            <EmptyNote explains={t("inventory.emptyExplains")}>
              {t("inventory.emptyTitle")}
            </EmptyNote>
          ) : (
            <WhoseRoots
              roots={tree.data.tree}
              caller={caller ?? { id: "", role: Role.USER }}
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

/**
 * The roots, grouped by whose they are (ADR 26).
 *
 * Yours first, with no heading: it is the house you came to look at. Then,
 * for an administrator, each other person's under that person's name; for
 * anybody else, what was shared with them. `rootsByWhose` decides which is
 * which, the same way for both clients.
 */
const WhoseRoots = ({
  roots,
  caller,
  onOpen,
}: {
  readonly roots: readonly StorageUnitTreeView[];
  readonly caller: { readonly id: string; readonly role: Role };
  readonly onOpen: (id: string) => void;
}): JSX.Element => {
  const t = useTranslate();
  const colors = useColors();
  const groups = rootsByWhose(roots, caller);
  const heading = [styles.heading, { color: colors.ink }];

  return (
    <>
      {groups.yours.length === 0 ? null : <UnitTree nodes={groups.yours} onOpen={onOpen} />}

      {groups.others.map((group) => (
        <View
          key={group.owner.id}
          style={styles.group}
          accessibilityLabel={t("inventory.spacesOf", { username: group.owner.username })}
        >
          <Text accessibilityRole="header" style={heading}>
            {group.owner.username}
          </Text>
          <UnitTree nodes={group.roots} onOpen={onOpen} />
        </View>
      ))}

      {groups.sharedWithYou.length === 0 ? null : (
        <View style={styles.group} accessibilityLabel={t("inventory.sharedWithYou")}>
          <Text accessibilityRole="header" style={heading}>
            {t("inventory.sharedWithYou")}
          </Text>
          <UnitTree nodes={groups.sharedWithYou} onOpen={onOpen} />
        </View>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  /**
   * `alignItems: "stretch"` is React Native's default for a row and is stated
   * anyway, because it is what makes the two rectangles the same height and it
   * is exactly the line somebody removes while tidying.
   */
  actions: { flexDirection: "row", alignItems: "stretch", gap: space.s2 },
  group: { gap: space.s2, marginTop: space.s3 },
  heading: { fontSize: text.l, fontWeight: "700" },
});
