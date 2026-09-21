import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { JSX } from "react";
import { StyleSheet, View } from "react-native";

import type { RootStackParamList } from "../app/navigation.js";
import { Loading } from "../ui/atoms/loading.js";
import { ScreenTitle } from "../ui/atoms/screen-title.js";
import { EmptyNote } from "../ui/molecules/empty-note.js";
import { FailureNote } from "../ui/molecules/failure-note.js";
import { RowLink } from "../ui/molecules/row-link.js";
import { Screen } from "../ui/organisms/screen.js";
import { space } from "../ui/styles/tokens.js";
import { useEveryItem } from "./item-queries.js";

/**
 * Everything you own, in one request, every row carrying its breadcrumb
 * (ADR 15).
 *
 * The order is the API's answer rather than this client's opinion, and the
 * location comes already joined — a flat list of names answers nothing in a
 * product about knowing WHERE things are.
 */
export const AllItemsScreen = (): JSX.Element => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const items = useEveryItem();

  return (
    <Screen>
      <ScreenTitle>Everything you own</ScreenTitle>

      {items.isPending ? <Loading label="Loading everything you own" /> : null}

      {items.isError ? (
        <FailureNote
          error={items.error}
          title="That list could not be loaded"
          onRetry={() => {
            void items.refetch();
          }}
        />
      ) : null}

      {items.isSuccess ? (
        items.data.items.length === 0 ? (
          <EmptyNote>Nothing is registered yet. Open a box and add what is in it.</EmptyNote>
        ) : (
          <View style={styles.list} accessibilityLabel="Everything you own">
            {items.data.items.map((row) => (
              <RowLink
                key={row.item.id}
                title={row.item.name}
                detail={row.location}
                onPress={() => {
                  navigation.navigate("Item", { id: row.item.id });
                }}
              />
            ))}
          </View>
        )
      ) : null}
    </Screen>
  );
};

const styles = StyleSheet.create({
  list: { gap: space.s2 },
});
