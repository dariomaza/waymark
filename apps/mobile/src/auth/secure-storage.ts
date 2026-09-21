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
}

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
});

/**
 * For a device where the keystore refuses — and for the tests.
 *
 * A session that cannot be persisted must still work for as long as the app is
 * open, which is the same fallback the web client makes when a browser has
 * site data blocked.
 */
export const inMemorySecureStorage = (
  seed: Readonly<Record<string, string>> = {},
): SecureStorage => {
  const held = new Map(Object.entries(seed));

  return {
    read: async (key) => held.get(key) ?? null,
    write: async (key, value) => {
      held.set(key, value);
    },
    remove: async (key) => {
      held.delete(key);
    },
  };
};
