# Background removal

Optional, out of process, and unable to break anything (ADR 4, ADR 10). With
`WAYMARK_IMAGE_PROCESSOR_URL` unset there is no processor, no worker and no
timer: photos are uploaded, stored and served from their originals, and every
one of them sits at `PENDING` until a sidecar appears. That is a complete
installation.

Turning it on is one flag: the second compose file by hand, or
`WAYMARK_DEPLOY_IMAGE_PROCESSING=1` in `scripts/deploy.env` for the deploy
script (see *Deployment*). The file brings the sidecar and the address the API
needs together, so there is no URL to set.

With a sidecar, an upload still answers `201` immediately and the work happens
afterwards:

1. The photo is written and saved as `PENDING`. Nothing on the request path
   ever calls the sidecar.
2. A worker claims it — one at a time by default — reads the original, posts the
   bytes to `POST /remove`, and gets back a cutout with an alpha channel.
3. The cutout is composited onto **white**, not left transparent, and stored as
   a JPEG beside the original. A transparent PNG on a dark themed phone shows
   the inside of a box on black.
4. The photo becomes `DONE` and `GET /photos/:id` starts serving the new file.
   It is the one URL in this API whose bytes can change, so it revalidates while
   `PENDING` and is `immutable` afterwards.

**What happens when it goes wrong** is the whole design. A sidecar that is down,
timing out, overloaded or answering nonsense is a statement about the SIDECAR:
the photo stays `PENDING` and is retried after 1, 2, 4 then 8 minutes, capped at
30, five times. A `4xx` is a statement about the BYTES — the decoder read them
and refused — so the photo is `FAILED` immediately, because the same bytes will
be refused identically for ever. A `204` means "nothing to remove" and the photo
is `SKIPPED` and never asked again.

`GET /photos/processing` answers whether the sidecar is configured and
reachable, how many photos are in each state, and which were abandoned with the
reason and the attempts spent — so neither question needs SSH and a SQL client.
`POST /photos/:id/reprocess` and `POST /photos/processing/retry` put photos back
in the queue and forget their attempts.

All three have buttons. A photo whose removal failed says so under the picture,
with a retry beside the sentence and a link to `/processing` in the web
client, which is where somebody who has just met one failure looks for the
rest. That screen is deliberately not in the bottom navigation: a tab for an
optional secondary feature would be this app disagreeing with ADR 4 in the
place people look most. `GET /health` is deliberately untouched
by all of this: it answers `ok` while background removal is broken, behind or
switched off, which is exactly what "optional" has to mean.

| Variable                                  | Default  | What it decides                                    |
| ----------------------------------------- | -------- | -------------------------------------------------- |
| `WAYMARK_IMAGE_PROCESSOR_URL`             | _unset_  | The sidecar's address. Unset switches the feature off. |
| `WAYMARK_IMAGE_PROCESSOR_TIMEOUT_SECONDS` | `120`    | When one removal is abandoned as hung.              |
| `WAYMARK_IMAGE_PROCESSOR_CONCURRENCY`     | `1`      | Photos in flight at once. rembg already uses every core. |
| `WAYMARK_IMAGE_PROCESSOR_MAX_ATTEMPTS`    | `5`      | Attempts before a photo is left `FAILED`.           |
| `WAYMARK_IMAGE_PROCESSOR_POLL_SECONDS`    | `15`     | How often work is looked for when no upload woke it. |
