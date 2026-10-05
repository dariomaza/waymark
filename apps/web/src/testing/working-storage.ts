import { vi } from "vitest";

/**
 * # A working `Storage`, for tests that promise something is never stored
 *
 * This jsdom build has no `localStorage` at all (`sessionStorage` it has). An
 * assertion that a secret is not in the real one passes whatever the code
 * does: a write through `localStorage?.setItem` lands nowhere, and a write
 * through `localStorage.setItem` throws somewhere nobody looks. So a test that
 * makes that promise puts a storage that works in its place first, with
 * `withWorkingStorage()`, and reads it back with `everythingIn`.
 *
 * `vi.stubGlobal` is undone by `vi.unstubAllGlobals()`; call it in an
 * `afterEach` of the file that stubs.
 */
export const aWorkingStorage = (): Storage => {
  const entries = new Map<string, string>();

  return {
    get length() {
      return entries.size;
    },
    key: (at: number) => [...entries.keys()][at] ?? null,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, String(value));
    },
    removeItem: (key: string) => {
      entries.delete(key);
    },
    clear: () => {
      entries.clear();
    },
  };
};

/** Real storages in place of the jsdom ones, for as long as one test runs. */
export const withWorkingStorage = (): void => {
  vi.stubGlobal("localStorage", aWorkingStorage());
  vi.stubGlobal("sessionStorage", aWorkingStorage());
};

/**
 * Every key and value a storage holds, as one string to search. Read through
 * `key(i)`, not `Object.keys` or `JSON.stringify`: `Storage` keeps its entries
 * behind an index rather than as enumerable own properties, so the obvious
 * spelling would pass against a storage full of secrets.
 *
 * A storage that is not there answers "" — which is exactly why the tests that
 * call this stand a working one up first.
 */
export const everythingIn = (storage: Storage | undefined): string => {
  if (storage === undefined) {
    return "";
  }

  const values: string[] = [];
  for (let at = 0; at < storage.length; at += 1) {
    const key = storage.key(at);
    values.push(key ?? "", (key === null ? null : storage.getItem(key)) ?? "");
  }

  return values.join("\n");
};
