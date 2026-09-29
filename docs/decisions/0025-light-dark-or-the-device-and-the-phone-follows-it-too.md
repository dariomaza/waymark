# 25. Light, dark or the device's own — and the phone follows it too

- Status: accepted
- Date: 2026-09-29

## Context

The browser had two schemes and followed `prefers-color-scheme`, with no way
to choose. The phone had one: `userInterfaceStyle` was `dark` in `app.json`,
every stylesheet was built at import time against the dark palette, and
`palette.ts` said why — "a phone held over a box does not get that choice,
because the camera screen is black either way".

That argument was about one screen. Every other screen in the app is read,
not aimed, and the owner asked for a light scheme and a switch between them
on both clients.

## Decision

- **Three answers, in both clients, in this order:** System (the default),
  Light, Dark. They sit on the account screen under the language, as a row
  of three radios with a picture and a word each (`sunMoon`, `sun`, `moon`).
  It is a setting, not an action, so it does not compete with the screen's
  one primary action (ADR 21).
- **Written once.** The answers, the default and the resolving
  (`schemeFor`) are in `packages/tokens/src/scheme.ts`, beside the palettes
  they choose between. A device with no opinion gets the dark.
- **The phone now defaults to System instead of always-dark.**
  `userInterfaceStyle` is `automatic`, and the phone's setting is a port
  (`device-scheme.ts`) that is followed live while System is chosen. The
  choice is kept in the keystore beside the language.
- **The browser** puts a choice on the root as `data-theme`, which the
  generated stylesheet obeys in both directions: a dark choice beats a light
  system (`:root:not([data-theme="dark"])` inside the media query) and a
  light choice beats a dark one (`:root[data-theme="light"]`). System is the
  absence of the attribute. A classic script in `public/theme.js` applies the
  stored choice before the first paint; it is a same-origin file because the
  document's policy is `script-src 'self'` with no `'unsafe-inline'`.
  `<meta name="theme-color">` follows the scheme actually painted.
- **The mark has its own colour token**, `mark`: the lime on the dark, the
  ink on the light (ADR 24: never lime on white). It replaced a media-query
  override in the shell's stylesheet, which could not see a choice.
- **The accent border is shared now.** It gives the lime fill a silhouette
  on the light page (1.26 against the surface, 3.24 with the edge) and was
  web-only because only the browser had that page. `focus` stays web-only.

## Consequences

- Every colour on the phone comes from one source, `ui/styles/theme.tsx`:
  `useColors()` while drawing and `themed()` for a stylesheet, built once per
  scheme. The static `colors` export is gone, so nothing can quietly stay
  dark.
- Two words were painted in the lime FILL and looked right only because the
  dark had been the only scheme: the place a search hit is in, and a photo's
  "Cover". Both clients now use the accent's foreground there, and both have
  a test that fails on any other.
- The phone's tab bar tint and underline are `accentText`, the foreground,
  as the browser's already were.

## What it costs

- **Every stylesheet on the phone is a hook now.** Fifty-odd files moved
  from `StyleSheet.create` at import to `themed()`, and a component that
  forgets `useStyles()` does not compile — but a colour computed outside a
  component would still have to be caught by review.
- **A root background that stays dark.** The native root view's own colour
  is the dark surface from `app.json` on both schemes; it is not visible once
  the app has drawn. (The launch screen used to stay dark too — see the
  amendment below.)
- **A second reader of the stored key.** `public/theme.js` cannot import the
  store, so a test holds the two to each other.
- **The web's pre-paint script cannot set the browser's bar colour** without
  a literal colour of its own; the bar is the dark surface for the moment
  between the document arriving and the bundle starting.

## Amendment, 2026-09-29: the launch screen follows the device

- **The Android splash follows the phone's scheme.** On a light phone it is
  the mark in the light scheme's `mark` — the ink — on the light `surface`;
  on a dark phone it is today's lime on the dark `surface`. It is declared
  through `expo-splash-screen`'s own light/dark support in `app.json`: the
  top level is the light phone's, the `dark` block becomes Android's night
  resources. The ink PNG, `splash-icon-light.png`, is drawn by
  `render-icons.sh` from the same source at the same size as the lime one.
  A test holds both colours in `app.json`, and the script's ink, to the
  tokens.
- **It follows the device, not the choice on the account screen.** Android
  draws it before any JavaScript runs, so a phone set to Light in the app
  but Dark in the system still opens on the dark splash.
- **The root view's colour cannot follow.** `expo-system-ui` writes one
  `backgroundColor` into `values/colors.xml` with no night variant, so it
  stays the dark surface. The launcher icon stays lime on ink on both.
