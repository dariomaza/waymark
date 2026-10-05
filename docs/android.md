# Android app

`apps/mobile`. Expo and React Native, sharing `@waymark/api-client` and
`@waymark/domain` with the web PWA as TypeScript source — no build step
between them, which is the whole reason Expo was chosen over Kotlin.

```
src/auth       Signing in, the session in the keystore, and the gate.
src/units      The tree, one unit, create / edit / move / empty / delete, the label.
src/items      One item, adding, editing, moving, deleting, everything you own.
src/search     The screen the product is named after.
src/scanning   The camera, and the `/u/<publicId>` a label encodes.
src/photos     Taking one, choosing one, uploading, ordering.
src/api        The mobile half of the shared client, and the React wiring.
src/ui         atoms / molecules / organisms — the shared visual vocabulary.
src/app        The composition root: ports, providers, the navigators.
```

The top level names what the app DOES, the same way `apps/web` does, and
inside a feature the split is the same: containers fetch and orchestrate,
views take props and draw. **No business rules live here.** The move picker
offers targets that would make a cycle and the delete does not pre-check
emptiness; those are the domain's (ADR 2, ADR 3) and this app renders the
answer, including the refusal — a 409 with a button that changes the world, a
422 against the field that caused it (ADR 8).

**Scanning is the first tab and the app opens on it.** The product is a
printed QR on a box and a phone pointed at it; a tab buried behind a menu
would be burying the reason the app exists. A code read in the app and a label
opened from the stock camera go through the same screen, which resolves it
against the forest the app already loaded (ADR 12).

**The token lives in the Android Keystore**, by way of `expo-secure-store`,
because it grants full access to an inventory that is on the public internet.
`AsyncStorage` is a plain file in the sandbox — right for a remembered tab,
wrong for a credential.

Three things are shaped for a phone rather than copied from the browser:

- **A photo is a `file://` URI, not a `File`.** `expo-image-picker` hands back
  `{ uri, name, type }` and React Native's `FormData` streams it off disk;
  turning it into a `File` would mean holding a whole photo in the heap of the
  device that just took it. It is the one thing the shared client leaves open.
- **An image carries its own `Authorization` header.** The web client cannot
  put one on an `<img>` and fetches bytes into an object URL; React Native's
  `Image` takes headers, so the bytes go from the socket to the native decoder
  and a gallery of twenty is not twenty photos resident at once.
- **A unit picker is a list of rows, not a select.** Every option is a full
  path, and Android's picker wheel truncates it — which is exactly what makes
  a picker a coin toss between three boxes all called `Box 3`.

Tests drive the real screens through their accessible roles and labels, and
stub the network at the `fetch` boundary. Nothing in `src` is mocked. Three
things are ports because all three are the operating system and none of them
exists under a test runner: the keystore, the camera, and the photo library.

```sh
pnpm --filter @waymark/mobile start           # Metro, then press `a`
pnpm --filter @waymark/mobile test
pnpm --filter @waymark/mobile typecheck
pnpm --filter @waymark/mobile prebuild        # generates android/ from the config
```

`EXPO_PUBLIC_WAYMARK_API_URL` says where the API is, as a PHONE sees it. It
defaults to `http://127.0.0.1:3000`, which is only ever right on an emulator:
a real device on the same wifi needs the machine's LAN address, and a device
anywhere else needs the tunnel's public hostname. Put it in
`apps/mobile/.env`.

Android 9 and up refuse plain HTTP by default, so a LAN address needs
`usesCleartextTraffic` for development or the tunnel's HTTPS hostname for
anything else.

**The installable APK is built by EAS**, and [`apps/mobile/README.md`](../apps/mobile/README.md) is the
whole of it: one command after `eas-cli login`, plus one `eas env:set` the
first time. `eas.json` names no server. This repository is public, and a
hostname committed into it would be a hostname every fork inherited — so the
address lives on whichever Expo account runs the build, and a build that was
never given one fails by name instead of returning an APK that reaches
nothing.

The `https` intent filter is **derived from that same variable**, in
`app.config.ts`, and that is why this app has a `.ts` config beside its
`app.json` at all. A label encodes `<WAYMARK_PUBLIC_BASE_URL>/u/<publicId>`
(ADR 12) and one container serves the API and the web client on one origin
(ADR 16), so the host printed on a sticker IS the host of the API address the
build was given. It used to be the placeholder `waymark.example`, which meant
the stock camera opened a browser for everybody.

A build told an `https:` address claims `/u` on that host, and the stock
camera offers this app. A build told anything else — including the
`http://127.0.0.1:3000` default — claims **no host at all**, which leaves
labels opening the web PWA exactly as they do today. Claiming nothing is the
right answer there: Android verifies no other scheme, and an APK that claimed
somebody else's hostname would be worse than one that claims none. The
`waymark://u/<code>` scheme needs no host and works either way.
