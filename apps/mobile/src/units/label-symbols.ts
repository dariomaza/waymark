import { queryKeys } from "@waymark/api-client";
import type { UnitId } from "@waymark/domain";
import { useQueries } from "@tanstack/react-query";

import { useApi } from "../api/api-context.js";

export interface LabelSymbols {
  /** Every symbol on the sheet has arrived and nothing failed. */
  readonly ready: boolean;
  readonly waitingFor: number;
  /** The first refusal, so the screen can say what went wrong. */
  readonly failure: Error | null;
  /** The markup for each unit asked about, by id, once it has arrived. */
  readonly markup: ReadonlyMap<UnitId, string>;
}

/**
 * # Knowing when the page is the truth
 *
 * The browser's twin of this file carries the argument, and it is the same one:
 * a print dialog opened while three symbols are still in flight puts blank
 * squares on paper, and the person finds out after cutting them up. So printing
 * waits on all of them.
 *
 * What differs is what "arrived" means. The browser draws each symbol as an
 * `<img>` pointed at an object URL and only needs to know the fetches finished;
 * this client builds a whole document and embeds the symbols IN it, so the
 * markup itself is the thing being waited for and is handed back here.
 *
 * Every symbol is behind the session like everything else (`qrSvg` sends the
 * token), which is the reason a bare URL in the page would not work.
 */
export const useLabelSymbols = (ids: readonly UnitId[]): LabelSymbols => {
  const api = useApi();

  const symbols = useQueries({
    queries: ids.map((id) => ({
      queryKey: queryKeys.qrSvg(id),
      queryFn: async () => await api.qrSvg(id),
      // A symbol is a pure function of the public id and the configured base
      // URL, so it is as stable as anything in this app gets.
      staleTime: 5 * 60 * 1000,
    })),
  });

  const failure = symbols.find((symbol) => symbol.error !== null)?.error ?? null;

  const markup = new Map<UnitId, string>();
  for (const [index, symbol] of symbols.entries()) {
    const id = ids[index];
    if (id !== undefined && symbol.data !== undefined) {
      markup.set(id, symbol.data);
    }
  }

  return {
    ready: ids.length > 0 && symbols.every((symbol) => symbol.isSuccess),
    waitingFor: symbols.filter((symbol) => !symbol.isSuccess && !symbol.isError).length,
    failure,
    markup,
  };
};
