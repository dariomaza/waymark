---
paths:
  - "apps/web/**"
---

# The web client (PWA)

- **Tests**: Vitest + Testing Library + MSW. `src/testing/setup.ts` fails a test
  that makes a request no handler declared — declare what a test depends on.
- **jsdom has no layout.** Sizes, wrapping and 360 px behaviour cannot be proven
  here; say so rather than implying it. `src/testing/drawn.ts` loads the real
  stylesheets so a test can assert what is actually drawn.
- **Light and dark schemes.** `src/ui/styles/tokens.css` is GENERATED from
  `@waymark/tokens` and compared byte for byte in a test; change the package,
  never the CSS. The light scheme's lime fill has 1.26 contrast against the
  surface and is rescued only by `--color-accent-border` (3.24).
- **Routes must not collide with the API.** The API serves this client from the
  same origin (ADR 16); `src/app/api-namespace.ts` lists the paths a screen may
  never take, and the service worker must not answer them.
- **A new build is not what a phone sees until the service worker lets go.**
  Close the installed PWA fully before judging a deploy by eye.
- **Passkeys exist only here.** They need a platform credential provider; the
  owner's phone has none, which is why fingerprint unlock lives in the app.
- **A link styled as a button needs the `.button` reset** (no underline) — it is
  on the class, keep it there.
