import { unitId } from "@ariadna/domain";
import type { JSX } from "react";
import { useParams } from "react-router-dom";

import { Loading } from "../ui/atoms/loading.js";
import { FailureNote } from "../ui/molecules/failure-note.js";
import { useStorageUnit } from "./unit-queries.js";
import { UnitDetail } from "./views/unit-detail.js";

/**
 * One storage unit: where it is, what is inside it, and what can be done to
 * it.
 *
 * The container owns the id from the URL, the request and the three states it
 * can be in. Everything it draws when the request worked is one presentational
 * component away.
 */
export const UnitScreen = (): JSX.Element => {
  const params = useParams<{ id: string }>();
  const id = unitId(params.id ?? "");
  const unit = useStorageUnit(id);

  return (
    <main className="screen">
      {unit.isPending ? <Loading label="Loading this unit" /> : null}

      {unit.isError ? (
        <FailureNote
          error={unit.error}
          title="That box is not open"
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
        />
      ) : null}
    </main>
  );
};
