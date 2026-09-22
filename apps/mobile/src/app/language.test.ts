import { inMemorySecureStorage, type SecureStorage } from "../auth/secure-storage.js";
import { createLanguageStore, DEFAULT_LANGUAGE, LANGUAGE_KEY } from "./language.js";

/**
 * The preference is stored and honoured from the day the switcher appears,
 * before a single string is translated. Wiring the storage first means the day
 * translations land there is nothing to migrate — the choice is already there.
 */
describe("which language the interface is asked for", () => {
  it("answers English until somebody has chosen", async () => {
    const store = createLanguageStore(inMemorySecureStorage());

    expect(await store.read()).toBe(DEFAULT_LANGUAGE);
  });

  it("remembers a choice across the app being killed", async () => {
    const phone = inMemorySecureStorage();

    await createLanguageStore(phone).save("es");

    // A second store over the same phone is what a cold start looks like.
    expect(await createLanguageStore(phone).read()).toBe("es");
  });

  /** A value this app did not write, or wrote two versions ago. */
  it("ignores anything stored that is not a language it has", async () => {
    const store = createLanguageStore(inMemorySecureStorage({ [LANGUAGE_KEY]: "klingon" }));

    expect(await store.read()).toBe(DEFAULT_LANGUAGE);
  });

  /**
   * A preference this small must never be the reason a screen fails to draw.
   * The keystore refuses on a device with no screen lock, and "no choice made
   * yet" is a perfectly good answer to that.
   */
  it("never fails a screen over a preference it could not reach", async () => {
    const locked: SecureStorage = {
      read: async () => {
        throw new Error("keystore is locked");
      },
      write: async () => {
        throw new Error("keystore is locked");
      },
      remove: async () => {
        throw new Error("keystore is locked");
      },
    };
    const store = createLanguageStore(locked);

    await expect(store.read()).resolves.toBe(DEFAULT_LANGUAGE);
    await expect(store.save("es")).resolves.toBeUndefined();
  });
});
