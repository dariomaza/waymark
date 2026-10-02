import { rootsByWhose, type StorageUnitTreeView } from "@waymark/api-client";
import { Role } from "@waymark/domain";
import { useId, useState, type JSX } from "react";
import { Link } from "react-router-dom";

import { Button } from "../ui/atoms/button.js";
import { Icon } from "../ui/atoms/icon.js";
import { Loading } from "../ui/atoms/loading.js";
import { EmptyNote } from "../ui/molecules/empty-note.js";
import { FailureNote } from "../ui/molecules/failure-note.js";
import { CreateUnitDialog } from "./create-unit-dialog.js";
import { useStorageUnitTree } from "./unit-queries.js";
import { UnitTree } from "./views/unit-tree.js";
import "./label-sheet-screen.css";
import { ROUTES } from "../app/routes.js";
import { useCaller } from "../auth/people-queries.js";
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
  const caller = useCaller();
  const [adding, setAdding] = useState(false);
  /*
    A new top-level space is refused only to a narrowed machine token (ADR
    26), and the tree says so. Not offered until the tree has said it.
  */
  const mayMakeRoot = tree.data?.mayMakeRoot === true;

  return (
    <main className="screen">
      <h2>{t("inventory.title")}</h2>

      {/*
        Two controls, on one line — "dos botones en línea". The primary is
        still the primary: it is the only lime rectangle on the screen and it
        comes first, which is what ADR 21 asks of a screen's one primary. What
        it no longer does is take the whole width and push the other errand
        underneath it at half the size.

        The second is an `<a>` and not a `<button>` because it is a URL and
        belongs in the history; it wears the same rectangle, which is where it
        gets the 48px floor. See `label-sheet-screen.css` for what the row does
        at 360px.
      */}
      <div className="inventory-screen__actions">
        {mayMakeRoot ? (
          <Button
            tone="primary"
            icon="plus"
            onClick={() => {
              setAdding(true);
            }}
          >
            {t("inventory.addSpace")}
          </Button>
        ) : null}
        <Link className="button button--secondary" to={ROUTES.labels}>
          <Icon name="tags" size={18} />
          {t("label.sheet")}
        </Link>
      </div>

      {tree.isPending ? <Loading label={t("inventory.loading")} /> : null}

      {tree.isError ? (
        <FailureNote
          error={tree.error}
          /*
            Titled, which the phone has always been. The same refusal read as a
            bare sentence here and as a named problem there, and the title is
            the half that says WHAT is missing.
          */
          title={t("inventory.failed")}
          onRetry={() => {
            void tree.refetch();
          }}
        />
      ) : null}

      {/*
        A title and a sentence under it, which is the shape `EmptyNote` was
        built for on both clients and which the phone has always drawn: on an
        empty screen the statement IS the content, and what the place is for
        goes underneath it quietly. This client said both halves in one line.
      */}
      {tree.isSuccess && tree.data.tree.length === 0 ? (
        <EmptyNote explains={t("inventory.emptyExplains")}>
          {t("inventory.emptyTitle")}
        </EmptyNote>
      ) : null}

      {tree.isSuccess && tree.data.tree.length > 0 ? (
        <WhoseRoots
          roots={tree.data.tree}
          caller={caller ?? { id: "", role: Role.USER }}
        />
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

/**
 * The roots, grouped by whose they are (ADR 26).
 *
 * Yours first, with no heading: it is the house you came to look at. Then,
 * for an administrator, each other person's under that person's name; for
 * anybody else, what was shared with them. `rootsByWhose` decides which is
 * which, the same way for both clients.
 */
const WhoseRoots = ({
  roots,
  caller,
}: {
  readonly roots: readonly StorageUnitTreeView[];
  readonly caller: { readonly id: string; readonly role: Role };
}): JSX.Element => {
  const t = useTranslate();
  const sharedHeading = useId();
  const groups = rootsByWhose(roots, caller);

  return (
    <>
      {groups.yours.length === 0 ? null : <UnitTree nodes={groups.yours} />}

      {groups.others.map((group) => (
        <section
          key={group.owner.id}
          className="inventory-screen__group"
          aria-label={t("inventory.spacesOf", { username: group.owner.username })}
        >
          <h3>{group.owner.username}</h3>
          <UnitTree nodes={group.roots} />
        </section>
      ))}

      {groups.sharedWithYou.length === 0 ? null : (
        <section className="inventory-screen__group" aria-labelledby={sharedHeading}>
          <h3 id={sharedHeading}>{t("inventory.sharedWithYou")}</h3>
          <UnitTree nodes={groups.sharedWithYou} />
        </section>
      )}
    </>
  );
};
