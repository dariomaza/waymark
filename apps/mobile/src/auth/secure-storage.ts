import * as SecureStore from "expo-secure-store";

/**
 * # Where the token lives, behind a port
 *
 * The session token grants full access to an inventory that is reachable from
 * the internet through a Cloudflare Tunnel (ADR 6). On a phone that means the
 * Android Keystore, which is what `expo-secure-store` wraps: the value is
 * encrypted with a key the OS holds and other apps cannot read, and it
 * survives the app being killed so scanning a box in a garage does not mean
 * typing a password one-handed.
 *
 * `AsyncStorage` would have been one line shorter and is the wrong place. It
 * is a plain unencrypted file in the app's sandbox — fine for a remembered
 * tab, not for a credential that is as good as the password on a rooted or
 * backed-up device.
 *
 * It is a PORT for the same reason the web client's camera is one: the
 * keystore is a piece of the operating system, genuinely outside this process,
 * and there is none of it under a test runner. Standing in for it is not the
 * same as stubbing the app's own code — everything the session then DOES is
 * the real store, the real client and the real screens.
 */
export interface SecureStorage {
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  /**
   * Whether this device can stand behind a sealed value AT ALL.
   *
   * Synchronous, like the module's own answer, because it is a property of the
   * hardware rather than a question being asked of anybody. It is `false` both
   * for a phone with no biometric sensor and for a phone whose owner has
   * enrolled nothing — those two are one answer through this API, and they
   * want the same behaviour anyway: do not offer a door that cannot open.
   */
  canUnlock(): boolean;
  /**
   * Writes a value the operating system will hand back only to somebody who
   * has proved who they are.
   *
   * On Android that is `setUserAuthenticationRequired` on a Keystore key, so
   * the guarantee is the OS's rather than this app's: without the fingerprint
   * the bytes cannot be decrypted, by this process or any other.
   */
  seal(key: string, value: string, prompt: string): Promise<void>;
  /**
   * Asks for a sealed value, which puts the system's prompt on screen.
   *
   * Rejects when somebody says no. Resolves `null` when there is nothing there
   * — including the case where the key has been invalidated because the
   * enrolled biometrics changed, which Android reports as an absence rather
   * than as an error.
   */
  unlock(key: string, prompt: string): Promise<string | null>;
}

/**
 * The sealed entries live under a keychain of their own.
 *
 * Not decoration: `expo-secure-store` documents that a key created with
 * `requireAuthentication` cannot share a `keychainService` with the entries
 * written without it, because the whole point is that it is a different
 * Keystore key with a different access policy. Sharing one would degrade the
 * authenticated entry to whatever the unauthenticated one was created as,
 * silently.
 */
const SEALED_KEYCHAIN = "waymark.sealed";

export const expoSecureStorage = (): SecureStorage => ({
  async read(key) {
    return (await SecureStore.getItemAsync(key)) ?? null;
  },
  async write(key, value) {
    await SecureStore.setItemAsync(key, value);
  },
  async remove(key) {
    await SecureStore.deleteItemAsync(key);
  },
  canUnlock() {
    return SecureStore.canUseBiometricAuthentication();
  },
  async seal(key, value, prompt) {
    await SecureStore.setItemAsync(key, value, {
      keychainService: SEALED_KEYCHAIN,
      requireAuthentication: true,
      authenticationPrompt: prompt,
    });
  },
  async unlock(key, prompt) {
    return (
      (await SecureStore.getItemAsync(key, {
        keychainService: SEALED_KEYCHAIN,
        requireAuthentication: true,
        authenticationPrompt: prompt,
      })) ?? null
    );
  },
});

/**
 * For a device where the keystore refuses — and for the tests.
 *
 * A session that cannot be persisted must still work for as long as the app is
 * open, which is the same fallback the web client makes when a browser has
 * site data blocked.
 */
export interface SealedBehaviour {
  /** Values already sealed, as a phone holds them the morning after. */
  readonly sealed?: Readonly<Record<string, string>>;
  /** What this stand-in device answers about its own biometrics. */
  readonly canUnlock?: boolean;
  /** Stands in for the person at the prompt. `false` is a cancelled one. */
  readonly answersThePrompt?: boolean;
}

export const inMemorySecureStorage = (
  seed: Readonly<Record<string, string>> = {},
  behaviour: SealedBehaviour = {},
): SecureStorage => {
  const held = new Map(Object.entries(seed));
  /**
   * Kept apart from the plain values rather than beside them, which is not a
   * convenience: on the device the two live under different keychains, so an
   * ordinary read of a sealed key finds nothing. A stand-in that answered the
   * sealed value to a plain read would let a bug through that the phone would
   * have caught.
   */
  const sealed = new Map(Object.entries(behaviour.sealed ?? {}));
  const canUnlock = behaviour.canUnlock ?? true;
  const answersThePrompt = behaviour.answersThePrompt ?? true;

  return {
    read: async (key) => held.get(key) ?? null,
    write: async (key, value) => {
      held.set(key, value);
    },
    remove: async (key) => {
      held.delete(key);
      sealed.delete(key);
    },
    canUnlock: () => canUnlock,
    seal: async (key, value) => {
      sealed.set(key, value);
    },
    unlock: async (key) => {
      if (!answersThePrompt) {
        throw new Error("The authentication prompt was cancelled");
      }

      return sealed.get(key) ?? null;
    },
  };
};
