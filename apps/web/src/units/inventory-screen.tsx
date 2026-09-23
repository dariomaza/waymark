import { useState, type JSX } from "react";
import { Link } from "react-router-dom";

import { Button } from "../ui/atoms/button.js";
import { Loading } from "../ui/atoms/loading.js";
import { EmptyNote } from "../ui/molecules/empty-note.js";
import { FailureNote } from "../ui/molecules/failure-note.js";
import { CreateUnitDialog } from "./create-unit-dialog.js";
import { useStorageUnitTree } from "./unit-queries.js";
import { UnitTree } from "./views/unit-tree.js";
import "./label-sheet-screen.css";
import { ROUTES } from "../app/routes.js";
import { useTranslate } from "../app/language-context.js";

/**
 * The home screen: everything you own, as the tree it is stored in.
 *
 * A container. It fetches, it decides between the four states a fetch has,
 * and it hands the data to a component that only knows how to draw a tree.
 *
 * A location IS a storage unit (ADR 1), so there is nothing else to show at
 * the top: the roots ARE the house.
 */
export const InventoryScreen = (): JSX.Element => {
  const t = useTranslate();

  const tree = useStorageUnitTree();
  const [adding, setAdding] = useState(false);

  return (
    <main className="screen">
      <h2>{t("inventory.title")}</h2>

      <div className="inventory-screen__actions">
        <Button
          tone="primary"
          icon="plus"
          onClick={() => {
            setAdding(true);
          }}
        >
          {t("inventory.addSpace")}
        </Button>
        <Link className="button button--secondary" to={ROUTES.labels}>
          {t("label.sheet")}
        </Link>
      </div>

      {tree.isPending ? <Loading label={t("inventory.loading")} /> : null}

      {tree.isError ? (
        <FailureNote
          error={tree.error}
          onRetry={() => {
            void tree.refetch();
          }}
        />
      ) : null}

      {tree.isSuccess && tree.data.tree.length === 0 ? (
        <EmptyNote>{t("inventory.emptyLine")}</EmptyNote>
      ) : null}

      {tree.isSuccess && tree.data.tree.length > 0 ? (
        <UnitTree nodes={tree.data.tree} />
      ) : null}

      {adding ? (
        <CreateUnitDialog
          parentId={null}
          onClose={() => {
            setAdding(false);
          }}
        />
      ) : null}
    </main>
  );
};
