import { afterEach, describe, expect, it, vi } from "vitest";

import { languageStore } from "./language.js";

/**
 * # The preference, on its own
 *
 * The frame's tests prove the choice reaches the screen. These prove the part
 * underneath: what is remembered, what happens when there is nowhere to
 * remember it, and what somebody who has never touched the switcher gets.
 *
 * jsdom here is configured WITHOUT `localStorage`, which is why the store
 * falls back to memory and why the real browser behaviour has to be stood up
 * deliberately rather than assumed.
 */
const withStorage = (): Storage => {
  const entries = new Map<string, string>();
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => void entries.set(key, value),
    removeItem: (key: string) => void entries.delete(key),
    clear: () => {
      entries.clear();
    },
    key: () => null,
    length: 0,
  } as unknown as Storage;

  vi.stubGlobal("localStorage", storage);

  return storage;
};

afterEach(() => {
  vi.unstubAllGlobals();
  languageStore.forget();
});

describe("which language the interface is asked for", () => {
  it("remembers a choice across a reload", () => {
    const storage = withStorage();

    languageStore.save("es");

    // Reading straight out of the store is what the NEXT page load does: a
    // fresh module, a fresh provider, and only what the browser kept.
    expect(storage.getItem("ariadna.language")).toBe("es");
    expect(languageStore.read()).toBe("es");
  });

  it("ignores anything stored that is not a language it has", () => {
    const storage = withStorage();
    storage.setItem("ariadna.language", "klingon");

    expect(languageStore.read()).toBe("en");
  });

  /**
   * Somebody whose machine is in Spanish should be spoken to in Spanish
   * without having to find a control first. The switcher exists to override
   * this, not to be the only way to reach it.
   */
  describe("before anybody has chosen", () => {
    it("takes the language the browser asks for", () => {
      withStorage();
      vi.stubGlobal("navigator", { languages: ["es-ES", "en"] });

      expect(languageStore.read()).toBe("es");
    });

    /** Region is not language: Ariadna's Spanish is neutral, so `es-419` is `es`. */
    it("ignores the region", () => {
      withStorage();
      vi.stubGlobal("navigator", { languages: ["es-419"] });

      expect(languageStore.read()).toBe("es");
    });

    it("skips past languages it does not have", () => {
      withStorage();
      vi.stubGlobal("navigator", { languages: ["ca", "gl", "es"] });

      expect(languageStore.read()).toBe("es");
    });

    it("falls back to English when the browser asks for nothing it speaks", () => {
      withStorage();
      vi.stubGlobal("navigator", { languages: ["de", "fr"] });

      expect(languageStore.read()).toBe("en");
    });

    /** A chosen language beats the browser's, which is the whole point of choosing. */
    it("prefers what somebody chose over what the browser asks for", () => {
      withStorage();
      vi.stubGlobal("navigator", { languages: ["en"] });

      languageStore.save("es");

      expect(languageStore.read()).toBe("es");
    });
  });

  /**
   * A private window, a browser with site data blocked, or this very test
   * runner. The preference must still hold for as long as the app is open —
   * otherwise somebody picks Spanish and watches it revert on the next screen.
   */
  describe("with nowhere to write it down", () => {
    it("still honours the choice for this visit", () => {
      languageStore.save("es");

      expect(languageStore.read()).toBe("es");
    });

    it("never throws a screen away over a preference", () => {
      vi.stubGlobal("localStorage", {
        getItem: () => {
          throw new Error("site data is blocked");
        },
        setItem: () => {
          throw new Error("site data is blocked");
        },
      });

      expect(() => {
        languageStore.save("es");
      }).not.toThrow();
      expect(languageStore.read()).toBe("es");
    });
  });
});
