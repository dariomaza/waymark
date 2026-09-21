import { queryKeys } from "@ariadna/api-client";
import type { UnitId } from "@ariadna/domain";
import { useQueries } from "@tanstack/react-query";

import { useApi } from "../api/api-context.js";

/**
 * The route the API hands out for a unit's printable symbol.
 *
 * SVG and not PNG: it is resolution independent, so the same bytes are crisp
 * at any sticker size, and it is about a tenth of the weight — which matters
 * when a sheet is sixty of them.
 */
export const qrSvgPath = (id: UnitId): string =>
  `/storage-units/${encodeURIComponent(id)}/qr.svg`;

export interface LabelSymbols {
  /** Every symbol on the sheet has arrived and nothing failed. */
  readonly ready: boolean;
  readonly waitingFor: number;
  /** The first refusal, so the screen can say what went wrong. */
  readonly failure: Error | null;
}

/**
 * # Knowing when the preview is the truth
 *
 * Every symbol is behind the session like every other image, so each one is
 * fetched and handed to the DOM as an object URL (see `AuthenticatedImage`).
 * On one label that is invisible. On a sheet of sixty it is the difference
 * between a page of labels and a page of holes, because a print dialog opened
 * while three symbols are still in flight puts blank squares on paper and the
 * person finds out after cutting them up.
 *
 * So printing waits on all of them. This asks for exactly what the labels
 * ask for, under exactly the same cache key, so the requests are shared
 * rather than doubled — what this adds is the one thing a component drawing
 * itself cannot know: whether its NEIGHBOURS are ready.
 */
export const useLabelSymbols = (ids: readonly UnitId[]): LabelSymbols => {
  const api = useApi();

  const symbols = useQueries({
    queries: ids.map((id) => ({
      // The same key `AuthenticatedImage` uses, so this warms the cache the
      // labels read from instead of fetching everything twice.
      queryKey: queryKeys.photo(qrSvgPath(id)),
      queryFn: async () => await api.fetchImage(qrSvgPath(id)),
      // A symbol is a pure function of the public id and the configured base
      // URL, so it is as stable as anything in this app gets.
      staleTime: 5 * 60 * 1000,
    })),
  });

  const failure = symbols.find((symbol) => symbol.error !== null)?.error ?? null;

  return {
    ready: ids.length > 0 && symbols.every((symbol) => symbol.isSuccess),
    waitingFor: symbols.filter((symbol) => !symbol.isSuccess && !symbol.isError).length,
    failure,
  };
};
