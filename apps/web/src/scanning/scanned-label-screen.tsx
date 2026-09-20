import { findByPublicId } from "@ariadna/api-client";
import { publicId } from "@ariadna/domain";
import type { JSX } from "react";
import { Link, Navigate, useParams } from "react-router-dom";

import { Loading } from "../ui/atoms/loading.js";
import { EmptyNote } from "../ui/molecules/empty-note.js";
import { FailureNote } from "../ui/molecules/failure-note.js";
import { useStorageUnitTree } from "../units/unit-queries.js";

/**
 * # `/u/<publicId>` — the address on every box in the house
 *
 * The QR code on a label encodes this URL and nothing else, because Android's
 * stock camera offers to OPEN a URL and merely offers to COPY a string
 * (README, ADR on QR codes). So this route is the product's front door, and
 * it is opened by a phone that may never have seen the app before.
 *
 * Two things therefore have to be true, and the second is the one that is
 * easy to get wrong:
 *
 * 1. It resolves a public code to a unit. The API has no route for that, so
 *    the forest the app already loads is searched instead — see
 *    `findByPublicId`.
 * 2. It survives having no session. The route sits behind the same gate as
 *    everything else, and that gate carries where the person was going into
 *    the login screen, which sends them BACK here afterwards. Landing them on
 *    a home screen after they scanned a specific box is the difference
 *    between the flagship feature working and feeling broken.
 *
 * The redirect replaces this entry in the history, so going back from the
 * box lands on whatever came before the scan and not in a loop through it.
 */
export const ScannedLabelScreen = (): JSX.Element => {
  const params = useParams<{ publicId: string }>();
  const code = publicId(params.publicId ?? "");
  const tree = useStorageUnitTree();

  if (tree.isPending) {
    return (
      <main className="screen screen--centred">
        <Loading label="Finding that box" />
      </main>
    );
  }

  if (tree.isError) {
    return (
      <main className="screen">
        <FailureNote
          error={tree.error}
          title="That label could not be looked up"
          onRetry={() => {
            void tree.refetch();
          }}
        />
      </main>
    );
  }

  const unit = findByPublicId(tree.data.tree, code);

  if (unit === null) {
    return (
      <main className="screen">
        <EmptyNote action={<Link to="/">Go to your inventory</Link>}>
          No unit in this inventory carries the code {code}. The label may
          belong to another house, or the unit may have been deleted.
        </EmptyNote>
      </main>
    );
  }

  return <Navigate to={`/units/${unit.id}`} replace />;
};
