import { unitId, STORAGE_UNIT_PATH_SEPARATOR } from "@ariadna/domain";
import type { JSX } from "react";
import { Link, useParams } from "react-router-dom";

import { AuthenticatedImage } from "../photos/authenticated-image.js";
import { Button } from "../ui/atoms/button.js";
import { Loading } from "../ui/atoms/loading.js";
import { FailureNote } from "../ui/molecules/failure-note.js";
import { useStorageUnit } from "./unit-queries.js";
import "./label-screen.css";

/**
 * # The label that goes on the box
 *
 * The symbol is served as SVG because it is the one to print: resolution
 * independent, so the same bytes are crisp at any sticker size, and about a
 * tenth of the PNG.
 *
 * It is fetched with the session and shown as an `<img>` pointed at an object
 * URL, exactly like a photo — the QR routes are behind the session too. That
 * also means the SVG is never inlined into this document: an `<img>` cannot
 * run script from the file it draws, and while this particular SVG comes from
 * Ariadna's own renderer, inlining remote markup is a habit worth not having.
 *
 * The code is printed under the symbol in text. A scuffed label still has a
 * ten character code somebody can read out loud across a garage, and that is
 * the whole reason `publicId` is Crockford Base32.
 */
export const LabelScreen = (): JSX.Element => {
  const params = useParams<{ id: string }>();
  const id = unitId(params.id ?? "");
  const unit = useStorageUnit(id);

  return (
    <main className="screen label-screen">
      {unit.isPending ? <Loading label="Loading the label" /> : null}

      {unit.isError ? (
        <FailureNote
          error={unit.error}
          onRetry={() => {
            void unit.refetch();
          }}
        />
      ) : null}

      {unit.isSuccess ? (
        <>
          <div className="label-screen__actions">
            <Button
              tone="primary"
              onClick={() => {
                globalThis.print();
              }}
            >
              Print this label
            </Button>
            <Link className="button button--secondary" to={`/units/${unit.data.unit.id}`}>
              Back to the unit
            </Link>
          </div>

          <article className="label">
            <AuthenticatedImage
              className="label__symbol"
              src={`/storage-units/${encodeURIComponent(unit.data.unit.id)}/qr.svg`}
              alt={`QR code for ${unit.data.unit.name}`}
            />
            <p className="label__name">{unit.data.unit.name}</p>
            <p className="label__where">
              {unit.data.path.map((step) => step.name).join(STORAGE_UNIT_PATH_SEPARATOR)}
            </p>
            <p className="label__code">{unit.data.unit.publicId}</p>
          </article>

          <p className="label-screen__hint">
            Scanning this with any camera opens the box in Ariadna. Nobody has to
            install anything first.
          </p>
        </>
      ) : null}
    </main>
  );
};
