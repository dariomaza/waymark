# 16. The API serves the web client, from one origin

- Status: accepted
- Date: 2026-09-21

## Context

The product was finished and unusable. The domain, the API, the PWA and the
Android app were built and tested; the Docker stack had one service in it, the
API, and there was no web Dockerfile and nothing serving `apps/web/dist`. A
deployed Ariadna could be driven with `curl` and in no other way.

Every earlier document said the opposite of what this one decides, and said it
deliberately. `vite.config.ts`: "It is deliberately not served BY the API: that
process answers JSON under `default-src 'none'`." The README: "served from its
own origin — never by the API". Those sentences described an arrangement that
was never actually assembled, and assembling it would have meant a second
image, a second container, a second hostname on the Cloudflare Tunnel, and a
CORS allowlist to be kept in step with all three.

So the question was which of the two origins to build, not whether to keep an
existing one.

## Decision

**The API serves the built web client from its own origin.** One image, one
container, one hostname, and no CORS between the browser and the API.

The two are versioned together in one repository, released together, and have
never been deployed apart. Coupling the build makes that honest: the image
builds `apps/web` in its own stage and the runtime copies only `dist`, so a
compose file cannot bring up an API from one commit and a client from
another — a state that has no correct behaviour and would be discovered by
somebody in a garage.

### The fallback runs where nothing matched, and nowhere else

An unmatched path is decided by the not-found handler, not by a wildcard route
in front of the API. Every API route still matches first, by Fastify's own
router, so there is no ordering to maintain and no API response that goes
through any of this.

What is left over is handed to the client only when all of these hold. Each is
a refusal that matters:

1. **There is a built client at all.** With `ARIADNA_WEB_ROOT` unset there is
   no fallback, which is a complete configuration and the one a checkout and
   `vite dev` run as.
2. **The first path segment is not one the API claims.** This is the load
   bearing one. An API path that no longer exists must answer `404
   application/json`; answered `200 text/html` instead, a client reports
   `unexpected token < in JSON` — a sentence about a parser, which sends
   somebody to spend an hour in the wrong layer.
3. **It is a `GET` or a `HEAD`.** A `POST` answered with a page would tell a
   client that its write had been accepted.
4. **It is a file that exists, or a path with no file extension.** A missing
   `.js` is a 404 and never the shell: a phone holding a shell from before the
   last deploy asks for a chunk that has been replaced, and a document served
   in its place is reason 2 again, one layer down.

The set in rule 2 is **derived from Fastify's own route table** through an
`onRoute` hook, not written down. A hand-kept list is a second copy of the
truth, and the copy that goes stale here is the one that starts answering an
API path with a page — silently, because a page is a valid HTTP response.
Registering a route is the only way into the set, which is a property no
future route can forget to maintain. What derivation cannot notice is a whole
family being REMOVED, so a test pins the derived set against a literal: the
day `/search` stops being a route, that test fails rather than letting the
client quietly answer for it.

A path belonging to nobody — a typo — draws the app, which then says it has no
such screen. That is the right half to be generous in: the person typing it is
a person, and the client has a not-found screen for them.

### One origin has one namespace, so four screens moved

This is the cost, and it was not free. `/search`, `/items`, `/items/:id` and
`/photos/processing` were all screens in the web client AND routes in the API.
On one origin a path belongs to exactly one of them, and the API's routes win
because they are registered.

The failure that would have caused is worth naming, because it is nearly
invisible. A browser opening `/items` gets JSON — but only on a COLD load.
Once the service worker is installed, `navigateFallback` draws the shell from
the cache and every one of those screens works. The only person who would ever
have met the bug is somebody following a link for the first time.

The rule that resolved it is one the client had already been following without
saying so: **where the API uses the resource name, the app uses the shorter
human word.** `/units/:id` for `GET /storage-units/:id` was already that. So
`/things` and `/things/:id` for `GET /items`, `/find` for `GET /search`, and
`/processing` for `GET /photos/processing`. The words on screen did not
change; these are addresses.

Two addresses are contracts and could not have moved: `/` is the manifest's
`start_url`, and `/u/:publicId` is glued to boxes (ADR 12).

The alternative was to move the API under a `/api` prefix, which makes rule 2
structurally impossible rather than merely tested. It was rejected because it
changes what the API promises — every path in the README's table, every URL in
two clients, the healthcheck in the image — for a namespacing problem that
four screen addresses solved, and because `packages/api-client` already pins
those paths as a contract shipped to two clients.

The service worker gets the mirror of the server's rule: an explicit
`navigateFallbackDenylist` for the API's segments. Its scope is now the whole
origin, and without the denylist an installed app would draw itself for an API
URL typed into the address bar — the client telling the same lie the server's
fallback exists to avoid.

### CORS is not deleted; it stops applying

Nothing about the allowlist changed in code. What changed is who needs it.

A same-origin request is not a cross-origin request, so the browser does not
apply CORS to anything the PWA does any more. The Expo app sends no `Origin`
header at all, and never did — CORS is a rule browsers enforce on behalf of a
document, and there is no document there. So `ARIADNA_ALLOWED_ORIGINS` is now
for exactly one thing: a browser client served from somewhere ELSE, which in
practice means `vite dev` on `:5173` pointed at an API on `:3000`.

It stays an allowlist and never a reflection, it stays validated at startup,
and it stays empty by default. The net effect on a deployment is tighter, not
looser: before this decision the production PWA's origin HAD to be listed, and
now nothing does.

### Caching is the opposite for the two kinds of file

`caching.ts` already held the reasoning and it applies unchanged: a URL whose
bytes can change must revalidate, a URL whose bytes cannot may be kept.

- A file whose NAME is its content hash — `assets/index-0H5-v0tl.js`,
  `workbox-63c18b4d.js` — is `public, max-age=31536000, immutable`. Anything
  less throws away the point of hashing the name.
- `index.html`, `sw.js`, the manifest and the icons keep their names across
  every deploy, so their URLs serve new bytes the day an upgrade lands. They
  are `public, no-cache`, which means "store it, and ask before using it", and
  with the ETag beside it the usual answer is a 304 with no body.

`public`, where every other cached response in this API is `private`, because
these are the same bytes for everybody, are not behind a session, and describe
nothing about the inside of a house.

Recognising a hashed name is a rule with an asymmetry built into it: exactly
eight base64url characters between the name and the extension, so that
`apple-touch-icon.png` is not mistaken for one. A hash the rule fails to
recognise costs one conditional request; a name it recognises wrongly costs a
year of the wrong bytes.

### The document gets a policy of its own

Every JSON answer stays under `default-src 'none'`, which is right for a
response nothing should ever load anything on behalf of. A document is the
opposite — it exists to load its bundle — so the shell, and only the shell,
carries `default-src 'self'` with `blob:` on images, because every photo in
this app is fetched with the session and handed to the DOM as an object URL.

Styles get `'unsafe-inline'` and scripts do not. One screen computes an
indentation as a `style` attribute, which CSP counts as inline style;
`style-src-attr` would be the precise directive and is too new to rely on,
and an unsupported directive falls back to `style-src` with the failure being
a silently unindented tree. Scripts get no such concession.

## Consequences

- The product is reachable. One container, two volumes, one hostname on the
  tunnel, and a browser pointed at it draws the app.
- The image is one deployable and cannot be half-upgraded.
- Four screen addresses changed. Nothing printed changed: the QR encodes
  `/u/<publicId>` and that is untouched.
- `ARIADNA_ALLOWED_ORIGINS` is empty in a normal deployment, and a `vite dev`
  against a deployed API is the case that still needs it.
- The API can still be run with no client at all, and every HTTP test file but
  one does exactly that — so each of them is, incidentally, a test that the
  API is a complete JSON service on its own.
- One origin is one namespace for good. A new screen cannot be named after an
  API route, and `apps/web/src/app/routes.test.ts` is what says so.
