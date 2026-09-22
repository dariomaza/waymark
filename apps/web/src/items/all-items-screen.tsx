import type { JSX } from "react";

import { Loading } from "../ui/atoms/loading.js";
import { EmptyNote } from "../ui/molecules/empty-note.js";
import { FailureNote } from "../ui/molecules/failure-note.js";
import { ItemCover } from "../photos/item-cover.js";
import { useEveryItem } from "./item-queries.js";
import { ItemCard } from "./views/item-card.js";
import { thingPath } from "../app/routes.js";
import { useTranslate } from "../app/language-context.js";

/**
 * Every item in the house, each with where it is.
 *
 * One request, one answer, in the order the API sent it. A card cannot hold
 * the whole path, so it holds the last step of it — the box to walk to —
 * and the full breadcrumb waits one tap away, in the thing's own screen.
 */
export const AllItemsScreen = (): JSX.Element => {
  const t = useTranslate();

  const everything = useEveryItem();
  const rows = everything.data?.items ?? [];

  return (
    <main className="screen">
      <h2>{t("items.everything")}</h2>

      {everything.isPending ? <Loading label={t("items.gathering")} /> : null}

      {everything.isError ? (
        <FailureNote
          error={everything.error}
          onRetry={() => {
            void everything.refetch();
          }}
        />
      ) : null}

      {everything.isSuccess && rows.length === 0 ? (
        <EmptyNote explains={t("items.emptyExplains")}>
          {t("items.emptyTitle")}
        </EmptyNote>
      ) : null}

      {rows.length === 0 ? null : (
        <ul className="item-grid" aria-label={t("items.everyItem")}>
          {rows.map((row) => (
            <li key={row.item.id}>
              <ItemCard
                to={thingPath(row.item.id)}
                name={row.item.name}
                secondary={row.path.at(-1)?.name}
                quantity={row.item.quantity}
                photo={<ItemCover item={row.item} />}
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
};
