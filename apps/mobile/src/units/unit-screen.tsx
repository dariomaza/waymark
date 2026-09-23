import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { unitId } from "@waymark/domain";
import type { JSX } from "react";

import type { RootStackParamList } from "../app/navigation.js";
import { BulkMoveBar } from "../items/bulk-move-bar.js";
import { useItemSelection } from "../items/use-item-selection.js";
import { ItemCover } from "../photos/item-cover.js";
import { UnitPhoto } from "../photos/unit-photo.js";
import { Loading } from "../ui/atoms/loading.js";
import { FailureNote } from "../ui/molecules/failure-note.js";
import { Screen } from "../ui/organisms/screen.js";
import { UnitActions } from "./unit-actions.js";
import { UnitMenu } from "./unit-menu.js";
import { useStorageUnit } from "./unit-queries.js";
import { UnitDetail } from "./views/unit-detail.js";
import { useTranslate } from "../app/language-context.js";

/**
 * One storage unit: where it is, what is inside it, and what can be done to
 * it.
 *
 * The container owns the id from the route, the request, the three states it
 * can be in, and which sheet is open. Everything it draws when the request
 * worked is one presentational component away.
 */
export const UnitScreen = (): JSX.Element => {
  const t = useTranslate();

  const route = useRoute<RouteProp<RootStackParamList, "Unit">>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const id = unitId(route.params.id);
  const unit = useStorageUnit(id);
  const selection = useItemSelection();

  return (
    // Not a scroll view: the item grid below is the scroller, because a
    // virtualised list inside a scroll view is given infinite height and
    // quietly stops virtualising. See `ItemGrid`.
    <Screen scroll={false}>
      {unit.isPending ? <Loading label={t("units.loading")} /> : null}

      {unit.isError ? (
        <FailureNote
          error={unit.error}
          title={t("units.notOpen")}
          onRetry={() => {
            void unit.refetch();
          }}
        />
      ) : null}

      {unit.isSuccess ? (
        <UnitDetail
          unit={unit.data.unit}
          path={unit.data.path}
          childUnits={unit.data.children}
          items={unit.data.items}
          photo={<UnitPhoto unit={unit.data.unit} />}
          itemPhoto={(item) => <ItemCover item={item} />}
          onOpenUnit={(openId) => {
            navigation.push("Unit", { id: openId });
          }}
          onOpenItem={(itemId) => {
            navigation.navigate("Item", { id: itemId });
          }}
          actions={
            <UnitActions
              unit={unit.data.unit}
              onSearchInside={() => {
                // The search tab, already narrowed to this subtree (ADR 11).
                navigation.navigate("Tabs", {
                  screen: "Search",
                  params: { within: unit.data.unit.id },
                });
              }}
            />
          }
          menu={
            <UnitMenu
              unit={unit.data.unit}
              path={unit.data.path}
              onShowLabel={() => {
                navigation.navigate("Label", { id: unit.data.unit.id });
              }}
              onDeleted={() => {
                navigation.navigate("Tabs", { screen: "Inventory" });
              }}
              {...(unit.data.items.length === 0 || selection.picking
                ? {}
                : {
                    onPickSeveral: () => {
                      selection.start();
                    },
                  })}
            />
          }
          picking={{
            on: selection.picking,
            isSelected: (item) => selection.isSelected(item.id),
            toggle: (item) => {
              selection.toggle(item.id);
            },
            label: (item) => t("units.select", { name: item.name }),
          }}
          {...(selection.picking
            ? {
                belowItems: (
                  <BulkMoveBar itemIds={selection.selected} onDone={selection.clear} />
                ),
              }
            : {})}
        />
      ) : null}
    </Screen>
  );
};
