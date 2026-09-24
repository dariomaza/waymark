import { findById } from "@waymark/api-client";
import { unitId } from "@waymark/domain";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import {
  useNavigation,
  useRoute,
  type CompositeNavigationProp,
  type RouteProp,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useState, type JSX } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { RootStackParamList, TabParamList } from "../app/navigation.js";
import { ItemCover } from "../photos/item-cover.js";
import { Button } from "../ui/atoms/button.js";
import { Loading } from "../ui/atoms/loading.js";
import { ScreenTitle } from "../ui/atoms/screen-title.js";
import { TextField } from "../ui/atoms/text-field.js";
import { EmptyNote } from "../ui/molecules/empty-note.js";
import { FailureNote } from "../ui/molecules/failure-note.js";
import { Screen } from "../ui/organisms/screen.js";
import { colors, space, text } from "../ui/styles/tokens.js";
import { useStorageUnitTree } from "../units/unit-queries.js";
import { useSearch } from "./search-queries.js";
import { useDebouncedValue } from "./use-debounced-value.js";
import { SearchResults } from "./views/search-results.js";
import { useTranslate } from "../app/language-context.js";

/**
 * # The screen the product is named after
 *
 * Things get stored and then lost — not lost as in gone, lost as in "it is
 * somewhere in one of forty boxes". This is the way back to it — the product's
 * whole promise in one screen — so it is a tab of its own rather than a filter
 * box bolted onto a list.
 *
 * `within` is a subtree at any depth: a location IS a storage unit (ADR 1), so
 * "search the garage" means everything under it.
 *
 * # Why the scope is read from the route and not held in state
 *
 * This screen is a TAB, so once it has been opened it stays mounted for the
 * life of the app. It used to seed `useState` from `route.params` — and a
 * `useState` initialiser runs once, at mount, so the scope and the parameter
 * that produced it were two values with nothing keeping them equal.
 *
 * Today they cannot be seen to disagree, and the reason is not this file:
 * `navigate("Tabs", { screen: "Search", params })` rebuilds the tab
 * navigator's state, which throws this screen away and mounts a new one, so
 * the initialiser happens to run again on every scoped search. That was
 * measured, not assumed — pressing "Search everywhere" and then asking again
 * re-narrows correctly on `@react-navigation/bottom-tabs` 7.19.2, and the
 * same navigate also clears the parameter when it lands on another tab.
 *
 * Leaning on that is still wrong. It is a detail of somebody else's router,
 * it is invisible from here, and the day it changes this screen searches the
 * wrong box silently — no error, no empty list, just answers from somewhere
 * else. The parameter IS the screen's address, the way the query string is on
 * the web client, so it is read every render and the button that widens the
 * search clears it. Then there is one value and nothing to keep in step.
 */
/**
 * This screen is a tab that also pushes onto the stack above it: it opens
 * units and items, and it sets its own scope. Composing the two is what lets
 * `setParams` mean "this Search tab" while `navigate` still reaches `Unit`.
 */
type SearchNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, "Search">,
  NativeStackNavigationProp<RootStackParamList>
>;

export const SearchScreen = (): JSX.Element => {
  const t = useTranslate();

  const route = useRoute<RouteProp<TabParamList, "Search">>();
  const navigation = useNavigation<SearchNavigation>();
  const tree = useStorageUnitTree();

  const [typed, setTyped] = useState("");
  const query = useDebouncedValue(typed);

  const scope = route.params?.within ?? null;
  const within = scope === null ? null : unitId(scope);
  const results = useSearch(query, within);
  const scopeUnit =
    within === null || tree.data === undefined ? null : findById(tree.data.tree, within);

  return (
    // The results grid is the scroller; the field stays put above it, which
    // is what a search screen wants anyway. See `ItemGrid`.
    <Screen scroll={false}>
      <ScreenTitle>{t("search.title")}</ScreenTitle>

      <TextField
        label={t("search.field")}
        hint={t("search.hint")}
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
      />

      {within === null ? null : (
        <View style={styles.scope}>
          <Text style={styles.scopeText}>
            {t("search.insideUnit", { name: scopeUnit?.name ?? t("search.oneUnit") })}
          </Text>
          <Button
            onPress={() => {
              navigation.setParams({ within: undefined });
            }}
          >
            {t("search.everywhere")}
          </Button>
        </View>
      )}

      {query.trim() === "" ? (
        <EmptyNote explains={t("search.fieldHint")}>
          {t("search.prompt")}
        </EmptyNote>
      ) : null}

      {results.isFetching && results.data === undefined ? <Loading label={t("search.searching")} /> : null}

      {results.isError ? (
        <FailureNote
          error={results.error}
          onRetry={() => {
            void results.refetch();
          }}
        />
      ) : null}

      {results.data === undefined ? null : (
        <SearchResults
          results={results.data}
          itemPhoto={(hit) => <ItemCover item={hit.item} />}
          onOpenItem={(id) => {
            navigation.navigate("Item", { id });
          }}
          onOpenUnit={(id) => {
            navigation.navigate("Unit", { id });
          }}
        />
      )}
    </Screen>
  );
};

const styles = StyleSheet.create({
  scope: {
    gap: space.s2,
    backgroundColor: colors.surfaceRaised,
    borderRadius: space.s2,
    padding: space.s3,
  },
  scopeText: { color: colors.ink, fontSize: text.s },
});
