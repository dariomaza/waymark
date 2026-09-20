# 13. The PWA caches a shell and reads, and never queues a write

- Status: accepted
- Date: 2026-09-20

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
- `GET /storage-units` is cached network-first: a live answer always wins,
  the cached one is only ever the fallback for a dead connection.
- Anything that writes is attempted against the network and nothing else. It
  succeeds or it fails, now, and the screen says which.

Two things follow from that, and they are part of the decision rather than
details of it.

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
