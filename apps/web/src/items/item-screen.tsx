import { itemId } from "@waymark/domain";
import type { ItemView, StorageUnitView } from "@waymark/api-client";
import type { JSX } from "react";
import { useParams } from "react-router-dom";

import { ItemPhotos } from "../photos/item-photos.js";
import { Loading } from "../ui/atoms/loading.js";
import { FailureNote } from "../ui/molecules/failure-note.js";
import { ItemActions } from "./item-actions.js";
import { ItemMenu } from "./item-menu.js";
import { useItem } from "./item-queries.js";
import { useMayChange } from "../units/unit-queries.js";
import { ItemDetail } from "./views/item-detail.js";
import { useTranslate } from "../app/language-context.js";

export const ItemScreen = (): JSX.Element => {
  const t = useTranslate();

  const params = useParams<{ id: string }>();
  const id = itemId(params.id ?? "");
  const item = useItem(id);

  return (
    <main className="screen">
      {item.isPending ? <Loading label={t("items.loading")} /> : null}

      {item.isError ? (
        <FailureNote
          error={item.error}
          onRetry={() => {
            void item.refetch();
          }}
        />
      ) : null}

      {item.isSuccess ? (
        <LoadedItem
          item={item.data.item}
          path={item.data.path}
          holder={item.data.storageUnit}
        />
      ) : null}
    </main>
  );
};

/**
 * A thing is changed only where the space it is in may be changed (ADR 26).
 * In a space shared to look at, it is drawn with nothing to press: no edit,
 * no move, no menu, no photo controls.
 */
const LoadedItem = ({
  item,
  path,
  holder,
}: {
  readonly item: ItemView;
  readonly path: readonly StorageUnitView[];
  readonly holder: StorageUnitView | null;
}): JSX.Element => {
  const mayChange = useMayChange(item.storageUnitId);

  return (
    <ItemDetail
      item={item}
      path={path}
      photos={<ItemPhotos item={item} editable={mayChange} />}
      {...(mayChange
        ? {
            actions: <ItemActions item={item} />,
            menu: <ItemMenu item={item} holder={holder} />,
          }
        : {})}
    />
  );
};
