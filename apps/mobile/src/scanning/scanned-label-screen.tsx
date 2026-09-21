import { findByPublicId } from "@ariadna/api-client";
import { publicId } from "@ariadna/domain";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, type JSX } from "react";

import type { RootStackParamList } from "../app/navigation.js";
import { Button } from "../ui/atoms/button.js";
import { Loading } from "../ui/atoms/loading.js";
import { EmptyNote } from "../ui/molecules/empty-note.js";
import { FailureNote } from "../ui/molecules/failure-note.js";
import { Screen } from "../ui/organisms/screen.js";
import { useStorageUnitTree } from "../units/unit-queries.js";

/**
 * # `/u/<publicId>` — the address on every box in the house
 *
 * The QR code on a label encodes this URL and nothing else, because Android's
 * stock camera offers to OPEN a URL and merely offers to COPY a string. So
 * this screen is the product's front door: it is reached from the tab above,
 * and it is reached from a phone that has never opened the app before, through
 * the deep link the operating system hands over at launch.
 *
 * It resolves a public code to a unit against the forest the app already
 * loads, because the API has no route for that and does not need one (ADR 12).
 *
 * The unit REPLACES this screen in the stack, so going back from the box lands
 * on whatever came before the scan and not in a loop through it.
 */
export const ScannedLabelScreen = (): JSX.Element => {
  const route = useRoute<RouteProp<RootStackParamList, "ScannedLabel">>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const code = publicId(route.params.publicId);
  const tree = useStorageUnitTree();

  const unit = tree.data === undefined ? null : findByPublicId(tree.data.tree, code);

  useEffect(() => {
    if (unit !== null) {
      navigation.replace("Unit", { id: unit.id });
    }
  }, [unit, navigation]);

  if (tree.isPending) {
    return (
      <Screen>
        <Loading label="Finding that box" />
      </Screen>
    );
  }

  if (tree.isError) {
    return (
      <Screen>
        <FailureNote
          error={tree.error}
          title="That label could not be looked up"
          onRetry={() => {
            void tree.refetch();
          }}
        />
      </Screen>
    );
  }

  if (unit === null) {
    return (
      <Screen>
        <EmptyNote
          action={
            <Button
              onPress={() => {
                navigation.navigate("Tabs", { screen: "Inventory" });
              }}
            >
              Go to your inventory
            </Button>
          }
        >
          {`No unit in this inventory carries the code ${code}. The label may belong to another house, or the unit may have been deleted.`}
        </EmptyNote>
      </Screen>
    );
  }

  return (
    <Screen>
      <Loading label="Opening that box" />
    </Screen>
  );
};
