import { unitId } from "@ariadna/domain";
import { useEffect, useState, type JSX } from "react";
import { useSearchParams } from "react-router-dom";

import { Button } from "../ui/atoms/button.js";
import { Loading } from "../ui/atoms/loading.js";
import { TextField } from "../ui/atoms/text-field.js";
import { EmptyNote } from "../ui/molecules/empty-note.js";
import { FailureNote } from "../ui/molecules/failure-note.js";
import { findById } from "../units/flatten-tree.js";
import { useStorageUnitTree } from "../units/unit-queries.js";
import { useSearch } from "./search-queries.js";
import { useDebouncedValue } from "./use-debounced-value.js";
import { SearchResults } from "./views/search-results.js";
import "./search-screen.css";

/**
 * # The screen the product is named after
 *
 * Things get stored and then lost — not lost as in gone, lost as in "it is
 * somewhere in one of forty boxes". This is the thread out of that labyrinth,
 * so it is a screen of its own reachable from every other one, and not a
 * filter box bolted onto a list.
 *
 * The query lives in the URL. That makes a search a link somebody can send
 * across a house — "it is one of these" — and it is what the API chose `GET`
 * for.
 */
export const SearchScreen = (): JSX.Element => {
  const [params, setParams] = useSearchParams();
  const queryInUrl = params.get("q") ?? "";
  const withinId = params.get("within");

  const [typed, setTyped] = useState(queryInUrl);
  const query = useDebouncedValue(typed);

  useEffect(() => {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (query === "") {
          next.delete("q");
        } else {
          next.set("q", query);
        }

        return next;
      },
      // Replace, so a search is one entry in the history and not one per
      // keystroke: the back button must leave the search, not un-type it.
      { replace: true },
    );
  }, [query, setParams]);

  const within = withinId === null ? null : unitId(withinId);
  const results = useSearch(query, within);

  return (
    <main className="screen">
      <h2>Search</h2>

      <TextField
        id="search"
        type="search"
        label="Search for a thing or a box"
        hint="Accents do not matter. Every word has to match."
        autoComplete="off"
        autoCapitalize="none"
        // The reason somebody opened this screen is to type.
        autoFocus
        value={typed}
        onChange={(event) => {
          setTyped(event.target.value);
        }}
      />

      {within === null ? null : <ScopeNote within={within} />}

      {query.trim() === "" ? (
        <EmptyNote>
          Type what you are looking for. A word from its name, a tag, or the box
          it might be in.
        </EmptyNote>
      ) : null}

      {results.isFetching && results.data === undefined ? (
        <Loading label="Searching" />
      ) : null}

      {results.isError ? (
        <FailureNote
          error={results.error}
          onRetry={() => {
            void results.refetch();
          }}
        />
      ) : null}

      {results.data === undefined ? null : <SearchResults results={results.data} />}
    </main>
  );
};

/**
 * `within` is a subtree at any depth: a location IS a storage unit (ADR 1),
 * so "search the garage" means everything under it. Saying which part of the
 * house is being searched — and offering the way out — is the difference
 * between a scope and a search that mysteriously finds nothing.
 */
const ScopeNote = ({ within }: { readonly within: ReturnType<typeof unitId> }): JSX.Element => {
  const [, setParams] = useSearchParams();
  const tree = useStorageUnitTree();
  const unit = tree.data === undefined ? null : findById(tree.data.tree, within);

  return (
    <div className="search-scope">
      <p className="search-scope__text">
        Searching inside {unit === null ? "one unit" : unit.name}, and everything
        under it.
      </p>
      <Button
        onClick={() => {
          setParams(
            (previous) => {
              const next = new URLSearchParams(previous);
              next.delete("within");

              return next;
            },
            { replace: true },
          );
        }}
      >
        Search everywhere
      </Button>
    </div>
  );
};
