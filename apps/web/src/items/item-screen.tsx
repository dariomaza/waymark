import { itemId } from "@ariadna/domain";
import type { JSX } from "react";
import { useParams } from "react-router-dom";

import { ItemPhotos } from "../photos/item-photos.js";
import { Loading } from "../ui/atoms/loading.js";
import { FailureNote } from "../ui/molecules/failure-note.js";
import { ItemActions } from "./item-actions.js";
import { useItem } from "./item-queries.js";
import { ItemDetail } from "./views/item-detail.js";

export const ItemScreen = (): JSX.Element => {
  const params = useParams<{ id: string }>();
  const id = itemId(params.id ?? "");
  const item = useItem(id);

  return (
    <main className="screen">
      {item.isPending ? <Loading label="Loading this item" /> : null}

      {item.isError ? (
        <FailureNote
          error={item.error}
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
          actions={
            <ItemActions item={item.data.item} holder={item.data.storageUnit} />
          }
        />
      ) : null}
    </main>
  );
};
