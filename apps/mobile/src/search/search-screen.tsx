import { findById } from "@ariadna/api-client";
import { unitId } from "@ariadna/domain";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useState, type JSX } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { RootStackParamList, TabParamList } from "../app/navigation.js";
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

/**
 * # The screen the product is named after
 *
 * Things get stored and then lost — not lost as in gone, lost as in "it is
 * somewhere in one of forty boxes". This is the thread out of that labyrinth,
 * so it is a tab of its own rather than a filter box bolted onto a list.
 *
 * `within` is a subtree at any depth: a location IS a storage unit (ADR 1), so
 * "search the garage" means everything under it.
 */
export const SearchScreen = (): JSX.Element => {
  const route = useRoute<RouteProp<TabParamList, "Search">>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const tree = useStorageUnitTree();

  const [typed, setTyped] = useState("");
  const query = useDebouncedValue(typed);
  const [scope, setScope] = useState<string | null>(route.params?.within ?? null);

  const within = scope === null ? null : unitId(scope);
  const results = useSearch(query, within);
  const scopeUnit =
    within === null || tree.data === undefined ? null : findById(tree.data.tree, within);

  return (
    <Screen>
      <ScreenTitle>Search</ScreenTitle>

      <TextField
        label="Search for a thing or a box"
        hint="Accents do not matter. Every word has to match."
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
      />

      {within === null ? null : (
        <View style={styles.scope}>
          <Text style={styles.scopeText}>
            {`Searching inside ${scopeUnit?.name ?? "one unit"}, and everything under it.`}
          </Text>
          <Button
            onPress={() => {
              setScope(null);
            }}
          >
            Search everywhere
          </Button>
        </View>
      )}

      {query.trim() === "" ? (
        <EmptyNote explains="A word from its name, a tag, or the box it might be in.">
          Type what you are looking for
        </EmptyNote>
      ) : null}

      {results.isFetching && results.data === undefined ? <Loading label="Searching" /> : null}

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
