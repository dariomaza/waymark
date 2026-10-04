# Web client

`apps/web`. React, Vite, TypeScript, installed as a workspace package and
served **by the API, from the API's own origin** (ADR 16). One container, one
hostname, and no CORS for this client at all — a same-origin request is not a
cross-origin one, so `WAYMARK_ALLOWED_ORIGINS` is empty in a normal
deployment and exists only for a browser client served from somewhere else.

```
src/auth       Signing in, passkeys, the session, and the gate every other screen sits behind.
src/units      The tree, one unit, create / edit / move / empty / delete, labels.
src/items      One item, adding, editing, bulk move, delete, and everything you own.
src/search     The screen the product is named after.
src/scanning   The camera, and the `/u/<publicId>` a label opens.
src/photos     Uploading, ordering, and drawing a picture that needs a session.
src/api        The only place that speaks HTTP: the client, the contract, the errors.
src/ui         atoms / molecules / organisms — the shared visual vocabulary.
src/app        The composition root: providers, the route table, the shell.
```

**Where the API uses the resource name, this app uses the shorter human
word**, because one origin has one namespace and a path belongs to exactly one
of them. `/units/:id` was already that, for `GET /storage-units/:id`; so are
`/things` and `/things/:id` for `GET /items`, `/find` for `GET /search`, and
`/processing` for `GET /photos/processing`. The labels on screen did not
change — these are addresses, and the reason they changed is in ADR 16. `/`
and `/u/:publicId` are contracts and cannot move: one is the manifest's
`start_url` and the other is glued to boxes (ADR 12).

That is data with a test on it. `src/app/routes.ts` is the whole table, the
router and every link are built from it, and `src/app/routes.test.ts` refuses
any screen named after a path the API owns — because the failure is nearly
invisible. A browser opening `/items` is handed JSON, but only on a COLD load:
once the service worker is installed, `navigateFallback` draws the shell from
the cache and the screen works. The only person who ever meets it is somebody
following a link for the first time. `src/app/api-namespace.ts` holds the
API's segments for the same reason, and hands Workbox the denylist that keeps
the service worker from answering them either.

The top level names what the app DOES. Inside a feature, the split is between
containers, which fetch and orchestrate, and views, which take props and
draw — so every view is testable with no network at all, and every screen has
exactly one place that knows about requests.

**No business rules live here.** The client never checks whether a box is
empty before deleting it, and the move picker deliberately offers targets
that would make a cycle. Those rules are the domain's (ADR 2, ADR 3), the API
enforces them, and this app renders the answer — including the refusal. What
it does carefully is tell the two kinds of refusal apart: a 409 is about the
WORLD and comes with a button that changes it ("empty it into Metal wardrobe
and delete"), a 422 is about the REQUEST and lands next to the field that
caused it (ADR 8). Editing follows the same rule and picks the tone from the
failure KIND rather than from a list of codes, so a refusal nobody has met yet
still lands in the right box.

**Editing and moving are separate buttons**, on the unit screen and on the
item screen, because they are separate acts and only one of them can make the
inventory lie about where something is (ADR 14).

- **Mobile first.** Tap targets of 48px and up, navigation at the bottom
  where the thumb is, sheets that slide up from the bottom rather than
  dialogs in the middle, safe-area insets, and the device's own light or
  dark scheme — dark when it has no opinion, because half of this happens in
  a storage room at night — which the account screen can override (ADR 25).
- **Every image is fetched with the session.** `GET /photos/:id` and the QR
  routes are behind the bearer token, so a plain `<img src>` would answer
  401; the bytes are fetched like any other request and handed to the DOM as
  an object URL, revoked when the element goes.
- **A photo is shown the moment it is stored.** Background removal is
  optional, out of process and may never happen (ADR 4). Nothing waits for
  `DONE`.
- **A scanned label works for somebody who is not signed in yet**: the gate
  carries the destination into the login screen and back out of it. The code
  is resolved against the forest the app already loads (ADR 12).
- **Installable, and honest about offline** (ADR 13): the shell, the photos
  already seen, the forest of units and every item are cached, so both
  screens that answer "what do I own" draw with no signal. A search, one
  unit, one item and the background-removal summary are deliberately never
  cached — the reasons are in the ADR, and the list is data with a test on it
  in `src/app/pwa-caching.ts` rather than a literal in the build file. No
  write is ever queued for later.

Tests drive the real app through the DOM and stub the network at the HTTP
boundary with MSW. Nothing in `src` is ever mocked — a test that replaced the
app's own fetch wrapper would prove the wrapper was called and say nothing
about the contract with the API. The one exception is the camera, which is a
port with a ZXing adapter, because jsdom has no pixels.

```sh
pnpm --filter @waymark/web dev      # http://localhost:5173
pnpm --filter @waymark/web test
pnpm --filter @waymark/web build
```

`VITE_WAYMARK_API_URL` says where the API is, as a browser sees it. It
defaults to **nothing at all**, which makes every request relative and
therefore same-origin: the API serves this bundle, so the host to call it on
is the host it was downloaded from. A deployed bundle carries no build-time
hostname, so one image serves whatever the tunnel is called and moving the
tunnel is not a rebuild.

Set it for `pnpm --filter @waymark/web dev`, which serves the app on
`:5173` against an API on its own port — `http://127.0.0.1:3000` is where
`pnpm --filter @waymark/api dev` listens. That is a genuine cross-origin
browser client, and it is the one caller `WAYMARK_ALLOWED_ORIGINS` is still
for: put `http://localhost:5173` in it while developing that way.
