# 13. The PWA caches a shell and reads, and never queues a write

- Status: accepted
- Date: 2026-09-20
- Amended: 2026-09-21 — `GET /items` was added to the cached reads, and the
  reads that are deliberately never cached are now named. See "What is cached,
  and what is not" below.

## Context

The web client is used one-handed, standing in a garage or a storage room, on
a phone, in the places a house has the worst signal. "Installable and works
offline" is easy to say and covers two very different promises:

1. **The app opens and shows what it already knows** with no connection.
2. **The app accepts changes offline and applies them later.**

The second is the one people mean by "offline support", and it is not a
caching feature. It is replication: a delete, a move and an upload, recorded
on a phone in a pocket, replayed against an inventory that two other people
have changed in the meantime. Every interesting case is a conflict — the box
you emptied was deleted, the unit you moved things into is now inside the
thing you moved — and the domain has invariants that decide those outcomes
(ADR 2, ADR 3) which a client cannot evaluate against a world it cannot see.

## Decision

**The shell is cached. Reads are cached. Writes are never queued.**

- The document, the bundle, the stylesheet and the icons are precached, and
  every navigation falls back to that document. Opening the app with no
  signal draws a screen, and `/u/<publicId>` gets as far as the login or the
  error rather than the browser's offline page.
- Photos are cached on first sight. A stored file never changes once it has
  settled, and a grid of thumbnails is the first screen anybody opens.
- `GET /storage-units` and `GET /items` are cached network-first: a live
  answer always wins, the cached one is only ever the fallback for a dead
  connection.
- Anything that writes is attempted against the network and nothing else. It
  succeeds or it fails, now, and the screen says which.

### What is cached, and what is not

The list above was originally three items — the shell, the photos, the forest.
`GET /items` was not on it because it did not exist: ADR 15 made "everything
you own" one unpaginated request the day AFTER this was written, and the
omission was an accident rather than a decision. So the question is answered
here rather than left to whatever the `runtimeCaching` array happens to say.

**`GET /items` is cached, network-first, in the same cache as the forest.**
It is a read, it is one URL, and it is the second of the only two requests in
this app that draw a whole screen with no other context. With no signal the
alternative to a stale list is a screen with nothing on it at all, which is
precisely the failure the forest is cached to avoid, and ADR 15 already sized
the answer at a fraction of a megabyte. Network-first for the same reason the
forest is: a live answer always wins, and the cache is only ever the fallback
for a dead connection.

Three reads are deliberately NOT cached, and naming them is half the point of
this amendment:

- **`GET /search`.** The screen is query-driven, and a stale hit list reads as
  "you do not own that" — the one sentence a product about finding things must
  never say wrongly. A search that cannot be run is an honest error; a search
  answered from last week is not.
- **`GET /storage-units/:id` and `GET /items/:id`.** Both are reached from a
  list that IS cached, both are keyed by an id so the cache would grow without
  a bound anybody chose, and both change on every write — and a write is the
  thing this ADR refuses to queue, so a cached detail screen would be the one
  place the app could show a change that never happened.
- **`GET /photos/processing`.** It describes a queue that moves on its own
  (ADR 10), so a cached answer is exactly the failure that screen exists to
  prevent: a number that stopped being true while somebody was reading it.
  It also sits under `/photos/`, which is a cache-first cache, so it has to be
  excluded explicitly rather than merely left out.

The list lives in `apps/web/src/app/pwa-caching.ts` as data with a test on it,
not as a literal inside `vite.config.ts`. A build file is only evaluated by a
production build, and a route quietly served from a cache raises no error
anywhere — it is a screen that is confidently out of date, which nobody
reports as a bug. The test names every URL above and which cache, if any,
answers it.

Two things follow from all of that, and they are part of the decision rather
than details of it.

**A request is always attempted.** The query library's default is to pause
every request while `navigator.onLine` is false. That flag says an interface
is up, not that a homelab behind a Cloudflare Tunnel can be reached, and
pausing on it leaves a screen spinning with nothing to read. So requests go
out regardless, and "the app could not reach Ariadna" is a real answer from a
real attempt.

**The caches are dropped on sign-out.** They hold photographs of the inside
of a house. The session token is cleared, the query cache is cleared, and the
service worker's caches go with them; the shell is simply fetched again.

## Consequences

- The app is installable, opens offline, and is honest in one sentence about
  what that does and does not mean.
- Nothing is ever lost to a replay nobody watched: a change either happened
  or visibly did not.
- Somebody standing in a signal dead spot cannot record work to sync later.
  That is a real limitation of a real product, and the alternative is a
  distributed systems problem this project has no reason to take on.
- Offline reads are only as fresh as the last time the phone had signal, and
  the app does not pretend otherwise: the banner is shown for as long as the
  connection is down.
- Adding a read to the cached list is now a deliberate act with a test to
  change, and the reads that must stay live have their reasons written down
  beside them rather than implied by their absence.
