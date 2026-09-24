---
paths:
  - "apps/mobile/**"
---

# The Android app

- **Tests**: jest-expo + Testing Library. Run `pnpm --filter @waymark/mobile test`
  on its own. The operating system is behind ports with fakes in
  `src/testing/`: keystore (`auth/secure-storage.ts`), camera
  (`scanning/code-scanner.ts`, `fake-scanner.tsx`), photos
  (`photos/photo-source.ts`, `fake-photo-source.ts`), clipboard, printer
  (`units/printer.ts`, `fake-printer.ts`). Inject them in `render-app.tsx`; never
  mock Expo modules directly.
- **Rendering twice in one test poisons the rest of the file** with overlapping
  `act()` errors attributed to the wrong test. Use `relaunchApp()` from
  `render-app.tsx`.
- **The real proof that it bundles** is `npx expo export --platform android`.
  jest does not run Metro.
- **Dark only, by design.** No light palette. No hex literals — a test fails on
  any; colours come from `@waymark/tokens` through `ui/styles/tokens.ts`.
- **`app.config.ts` spreads `app.json`** and overrides only the deep-link host.
  The version lives in `app.json` (`expo.version`), which release-please bumps.
- **`EXPO_PUBLIC_WAYMARK_API_URL` is baked in at build time.** Without it the app
  falls back to `127.0.0.1`, which on a phone is the phone. EAS builds refuse
  without it; it lives in the Expo account's `production` environment, not in
  the repository.
- **Every package a config file names must be a declared dependency**
  (`babel-preset-expo` once was not, and EAS failed after ten minutes).
- **Biometric unlock** seals the session token in the Android Keystore
  (`expo-secure-store`, `requireAuthentication`). The `sealed` state reports what
  the keystore did, never what it is about to do (ADR 19, amended). No WebAuthn
  on the phone.
- **React Native `FormData` reports an unreadable file as a network failure.**
  `photos/streamable-photo.ts` checks the file before upload; keep it that way.
- **Building**: `npx eas-cli build --platform android --profile production`
  from `apps/mobile`. APKs reach people through GitHub Releases, never through
  EAS artifact links — those are three redirects deep and expire in fifteen
  minutes.
