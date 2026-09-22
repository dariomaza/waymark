import { inMemorySecureStorage, type SecureStorage } from "../auth/secure-storage.js";
import { createLanguageStore, LANGUAGE_KEY } from "./language.js";

/**
 * # The preference, on its own
 *
 * The frame's tests prove the choice reaches the screen. These prove the part
 * underneath: what is remembered, what somebody who has never touched the
 * switcher gets, and what happens when there is nowhere to remember it.
 */
describe("which language the interface is asked for", () => {
  /**
   * The device's own locale, stood up deliberately.
   *
   * This runner inherits the machine's locale, and the machine this was
   * written on is Spanish — so asserting the default without pinning it here
   * would pass in one place and fail in another for a reason nowhere in the
   * code. Every test that cares says which locale it means.
   */
  const phoneSetTo = (locale: string): void => {
    const real = Intl.DateTimeFormat;

    jest
      .spyOn(Intl, "DateTimeFormat")
      .mockImplementation(
        () => ({ resolvedOptions: () => ({ ...new real().resolvedOptions(), locale } ) }) as never,
      );
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("remembers a choice across the app being killed", async () => {
    const phone = inMemorySecureStorage();

    await createLanguageStore(phone).save("es");

    // A second store over the same phone is what a cold start looks like.
    expect(await createLanguageStore(phone).read()).toBe("es");
  });

  /** A value this app did not write, or wrote two versions ago. */
  it("ignores anything stored that is not a language it has", async () => {
    phoneSetTo("en-GB");
    const store = createLanguageStore(inMemorySecureStorage({ [LANGUAGE_KEY]: "klingon" }));

    expect(await store.read()).toBe("en");
  });

  /**
   * A phone set up in Spanish should open this app in Spanish without anybody
   * having to find a control first. The switcher exists to override this, not
   * to be the only way to reach it.
   */
  describe("before anybody has chosen", () => {
    it("takes the language the phone itself is in", async () => {
      phoneSetTo("es-ES");

      expect(await createLanguageStore(inMemorySecureStorage()).read()).toBe("es");
    });

    /** Region is not language: Waymark's Spanish is neutral, so `es-419` is `es`. */
    it("ignores the region", async () => {
      phoneSetTo("es-419");

      expect(await createLanguageStore(inMemorySecureStorage()).read()).toBe("es");
    });

    it("falls back to English on a phone set to something it does not speak", async () => {
      phoneSetTo("de-DE");

      expect(await createLanguageStore(inMemorySecureStorage()).read()).toBe("en");
    });

    /** A chosen language beats the phone's, which is the whole point of choosing. */
    it("prefers what somebody chose over what the phone is set to", async () => {
      phoneSetTo("en-GB");

      expect(
        await createLanguageStore(inMemorySecureStorage({ [LANGUAGE_KEY]: "es" })).read(),
      ).toBe("es");
    });
  });

  /**
   * A preference this small must never be the reason a screen fails to draw.
   * The keystore refuses on a device with no screen lock, and "no choice made
   * yet" is a perfectly good answer to that.
   */
  it("never fails a screen over a preference it could not reach", async () => {
    phoneSetTo("en-GB");
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

    await expect(store.read()).resolves.toBe("en");
    await expect(store.save("es")).resolves.toBeUndefined();
  });
});
