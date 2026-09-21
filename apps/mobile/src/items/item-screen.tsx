import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { itemId } from "@ariadna/domain";
import type { JSX } from "react";

import type { RootStackParamList } from "../app/navigation.js";
import { ItemPhotos } from "../photos/item-photos.js";
import { Loading } from "../ui/atoms/loading.js";
import { FailureNote } from "../ui/molecules/failure-note.js";
import { Screen } from "../ui/organisms/screen.js";
import { ItemActions } from "./item-actions.js";
import { useItem } from "./item-queries.js";
import { ItemDetail } from "./views/item-detail.js";

/** Container. One item, its breadcrumb, its photos and what can be done to it. */
export const ItemScreen = (): JSX.Element => {
  const route = useRoute<RouteProp<RootStackParamList, "Item">>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const id = itemId(route.params.id);
  const item = useItem(id);

  return (
    <Screen>
      {item.isPending ? <Loading label="Loading this item" /> : null}

      {item.isError ? (
        <FailureNote
          error={item.error}
          title="That item could not be loaded"
          onRetry={() => {
            void item.refetch();
          }}
        />
      ) : null}

      {item.isSuccess ? (
        <ItemDetail
          item={item.data.item}
          path={item.data.path}
          photos={<ItemPhotos item={item.data.item} />}
          onOpenUnit={(unitId) => {
            navigation.navigate("Unit", { id: unitId });
          }}
          actions={
            <ItemActions
              item={item.data.item}
              onDeleted={() => {
                navigation.goBack();
              }}
            />
          }
        />
      ) : null}
    </Screen>
  );
};
