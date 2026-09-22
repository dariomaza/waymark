# 10. Background removal is driven by a polling worker over the photo table

- Status: accepted
- Date: 2026-09-20

## Context

ADR 4 decided that background removal runs out of process, behind the
`ImageProcessor` port, and that a photo carries a `processingStatus` of
`PENDING | DONE | FAILED | SKIPPED`. It deliberately said nothing about what
actually moves a photo from the first of those to the others, and it left an
open consequence: "`FAILED` photos need a retry path, otherwise they stay
unprocessed forever."

So four questions were still open, and they are the ones that decide whether a
secondary feature can hurt the primary one:

1. What triggers processing, and what survives a restart with photos still
   `PENDING`?
2. How much may run at once? `rembg` on a homelab CPU takes real seconds per
   image, and an unbounded fan-out over a backlog takes the box down.
3. Which failures are worth retrying, and when does trying stop?
4. How does anybody find out that none of it is working?

## Decision

### The queue is the photo table

There is no broker. A photo waiting to be processed is a row with
`processingStatus = 'PENDING'`, written in the same transaction as the upload
that created it, and a worker loop in the API process claims from that.

Redis, BullMQ or an external queue were rejected because on one small box they
buy nothing and cost the one thing that matters here — a second copy of the
truth that has to be kept in step with the first. The classic failure of that
shape is exactly this feature's: the row says `PENDING`, the job was never
enqueued or was lost on a restart, and the photo sits unprocessed for ever with
nothing in the system able to notice. Here there is nothing to keep in step. A
restart is not a special case either: the process comes back, sweeps, and sees
every photo the old one saw, including the ones it died holding.

A second table, `PhotoProcessingAttempt`, holds only what the status column
cannot say: attempts so far, when the next one is due, who holds the photo right
now, and why it was given up on. A row there means "there is history", never
"there is work", so losing one can cost a retry counter and never a photo.

Claiming is one conditional write that takes a **lease**. Two workers — or one
worker woken twice, by an upload while the poll timer is already running — cannot
take the same photo, because the second conditional write matches nothing. A
worker that dies holding a photo does not take it with it: the lease expires and
the photo is claimable again. The attempt is counted at claim time rather than
at failure time, so a process that crashes mid-removal has still spent one, and
a crash loop is bounded by the same rule as a sidecar answering 500.

Uploads wake the worker so a photo is normally processed within seconds; the
poll interval (15s) is the floor for when that wake-up is lost.

### One photo at a time, and that is the point

`WAYMARK_IMAGE_PROCESSOR_CONCURRENCY` defaults to **1**. A batch is claimed,
awaited in full, and only then is the next one claimed.

onnxruntime already uses every core for a single forward pass, so a second
concurrent image buys no throughput at all: it halves the speed of both and
doubles the resident memory, on the same box that is serving the API, the
database and the photo volume. The sidecar enforces the same bound again with a
semaphore, because FastAPI's thread pool is a pool and not a queue, and a
service does not get to assume it has only one caller.

The request timeout is 120s — an order of magnitude past the worst honest case
for a 2048px photo on a slow ARM board, because a timeout exists to notice a
sidecar that has STOPPED answering, not to second-guess a slow one. Without it a
hung read holds the worker for ever and the queue silently stops moving while
every upload still succeeds, which is the failure that looks exactly like
everything working.

### Retries distinguish a broken sidecar from a broken photo

- **Transient** — nothing answered, the answer took too long, a 5xx, a 429, or
  bytes that are not an image. All of those are statements about the SIDECAR,
  which can be restarted, so the photo is retried: 1, 2, 4, 8 minutes, doubling,
  capped at 30, up to `WAYMARK_IMAGE_PROCESSOR_MAX_ATTEMPTS` (5). The photo stays
  `PENDING` throughout, because that is what it is.
- **Permanent** — a 4xx, or an original that is not on the volume. The sidecar
  read these bytes and refused them, and it will refuse them identically for
  ever; waiting will not make a missing file appear. The photo becomes `FAILED`
  on the first occurrence. Spending five attempts and twenty minutes of backoff
  on a fixed answer is a busy loop with extra steps.
- **Declined** — 204: looked at, nothing to remove. `SKIPPED`, and never asked
  again. The sidecar answers this when the model keeps almost no pixels, because
  compositing an empty mask onto white produces a blank white rectangle where a
  photo of a drill used to be.

When the attempts run out the photo becomes `FAILED` and the reason is kept.
That is not the end: `POST /photos/:id/reprocess` and
`POST /photos/processing/retry` put photos back in the queue and forget their
attempts, which is the retry path ADR 4 asked for. Requeuing clears the
`processedPath` too, because a `PENDING` photo still pointing at a processed
file is the one combination `displayPathOf` cannot read correctly.

### The white background is composited in the API

`rembg` answers with a cutout: the subject, plus an alpha channel where the
background used to be. What was asked for is a WHITE background, and those are
not the same picture — a transparent PNG on a dark themed phone puts the
contents of a box on black. The alpha is flattened onto white in the API, with
the same library that already re-encodes every upload, and stored as a JPEG
beside the original.

It is done there and not in the sidecar because it is a decision about what
Ariadna stores. A sidecar that made it would be a sidecar with an opinion about
the product, and the next change to how a photo looks would mean rebuilding a
Python container.

### Seeing it without a shell

`GET /photos/processing`, behind the session like everything else, answers
whether a sidecar is configured and reachable, how many photos are in each
state, and which ones were abandoned with the reason and the attempts spent.

`GET /health` is deliberately left alone. It is unauthenticated and
internet-facing through the tunnel, and it must keep answering "ok" while
background removal is broken, switched off or hopelessly behind — that is what
ADR 4 means, expressed as a probe.

## Consequences

- No broker, no worker container, no second copy of the queue. The whole product
  is still one Node process, one SQLite file and a directory of photos.
- A photo cannot be processed twice at once, and cannot be lost by a restart.
- Background removal cannot saturate the box: the bound is a claim size, not a
  hope.
- A dead sidecar costs, at worst, a quarter of an hour of retries and then a
  list of `FAILED` photos that one request puts back in the queue.
- The loop lives in the API process, so a deployment that wanted to scale
  processing separately would have to move it out. That is a real limit, and it
  is the correct trade for one homelab box: the sidecar is already the container
  that can be scaled, and the worker only feeds it.
- `Photo` gained one transition, `markPhotoPending`, and the domain still knows
  nothing about HTTP, rembg or containers.
