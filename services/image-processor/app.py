"""
Ariadna's background removal sidecar.

# What this is, and what it deliberately is not

It is `rembg` behind three HTTP verbs and nothing else. It holds no state, knows
nothing about photos, items or storage units, and never talks to the database or
the photo volume: the API reads the file, posts the bytes, and writes whatever
comes back. That is what makes it disposable — ADR 4 requires that stopping this
container leaves a working inventory, and the surest way to guarantee that is a
service that owns nothing.

It also does NOT composite the cutout onto white. `remove()` answers a subject
with an alpha channel, and turning that into "a photo on a white background" is
a decision about what Ariadna stores, so it is made in the API, with the same
library that already re-encodes every upload. A sidecar that made that decision
would be a sidecar with an opinion about the product, and the next change to how
photos look would mean rebuilding a Python container.

# The contract, in three answers

- `200 image/png`  — here is the cutout, with alpha.
- `204`            — I looked, and there is nothing to remove. The API records
                     the photo as SKIPPED and never asks again.
- `4xx`            — these bytes are not an image I can read. The API records
                     FAILED immediately, because the same bytes will be refused
                     identically for ever.

Anything else — a refused connection, a timeout, a 5xx — is read by the API as
"the sidecar is having a bad time", and the photo is retried later. The whole
retry policy on the other side is built on that distinction, so the status codes
here are load bearing.

# Why the model is loaded at startup

`new_session` downloads ~180 MB on first use and then builds an inference
session. Doing that inside the first request would make one unlucky photo wait
minutes and, on a fresh container, time out. Loading it before the port opens
means "the port answers" and "the model is ready" are the same fact, which is
exactly what a container healthcheck can act on.
"""

from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from io import BytesIO
from typing import Any, Final

import numpy as np
from fastapi import FastAPI, Request, Response
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from PIL import Image, UnidentifiedImageError
from rembg import new_session, remove

LOG: Final = logging.getLogger("ariadna.image-processor")

#: Which rembg model to use. `u2net` is the general purpose one; `u2netp` is a
#: 4 MB version of it for a board that cannot spare the memory, at a visible
#: cost in edge quality.
MODEL_NAME: Final = os.environ.get("REMBG_MODEL", "u2net")

#: The API caps uploads at 12 MB and stores at most 2048px on the longest edge,
#: so anything approaching this is not a photo from Ariadna.
MAX_REQUEST_BYTES: Final = int(os.environ.get("REMBG_MAX_REQUEST_MB", "32")) * 1024 * 1024

#: How many removals may run at once INSIDE this container.
#:
#: The API already bounds what it sends, but this service does not get to assume
#: it is the only caller. One forward pass already uses every core, so a second
#: concurrent one halves the speed of both and doubles the resident memory.
CONCURRENCY: Final = max(1, int(os.environ.get("REMBG_CONCURRENCY", "1")))

#: Below this fraction of kept pixels, the answer is 204 rather than a cutout.
#:
#: A model that found no subject returns an almost entirely transparent image.
#: Compositing THAT onto white gives a blank white rectangle where a photo of a
#: drill used to be — a worse outcome than leaving the original alone, and one
#: nobody would notice until they went looking for the drill.
MIN_SUBJECT_RATIO: Final = float(os.environ.get("REMBG_MIN_SUBJECT_RATIO", "0.005"))

#: A pixel is "kept" once it is more opaque than this.
ALPHA_FLOOR: Final = 16

#: Pillow's own decompression-bomb guard, stated rather than inherited. 100
#: megapixels is past any real camera and well under anything dangerous; it is
#: the same number the API's ingestion uses.
Image.MAX_IMAGE_PIXELS = 100_000_000

#: Filled in before the port opens. See the module docstring.
_session: Any = None

#: The bound, held for the duration of one removal.
#:
#: FastAPI runs blocking handlers on a thread pool of forty, which is a pool and
#: not a queue: without this, forty concurrent requests would become forty
#: concurrent forward passes and the box would stop responding to anything at
#: all. Callers past the bound WAIT here, which is backpressure, and the caller's
#: own timeout is what decides how long it is willing to.
_slots: Final = asyncio.Semaphore(CONCURRENCY)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global _session

    LOG.info("loading the %s model", MODEL_NAME)
    # Blocking on purpose: nothing should be able to reach `/remove` before the
    # model is in memory, and a container that is not ready should not say it is.
    _session = new_session(MODEL_NAME)
    LOG.info("model %s is ready", MODEL_NAME)

    yield


app = FastAPI(
    title="Ariadna image processor",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
    lifespan=lifespan,
)


@app.get("/health")
async def health() -> JSONResponse:
    """Whether this container can actually do the job it exists for."""
    ready = _session is not None

    return JSONResponse(
        status_code=200 if ready else 503,
        content={"status": "ok" if ready else "loading", "model": MODEL_NAME},
    )


@app.post("/remove")
async def remove_background(request: Request) -> Response:
    """Takes the raw bytes of one image and answers the cutout."""
    declared = request.headers.get("content-length")
    if declared is not None and declared.isdigit() and int(declared) > MAX_REQUEST_BYTES:
        return _refused(413, "the image is larger than this service accepts")

    body = await request.body()
    if len(body) == 0:
        return _refused(400, "the request carried no image")
    if len(body) > MAX_REQUEST_BYTES:
        return _refused(413, "the image is larger than this service accepts")

    try:
        image = Image.open(BytesIO(body))
        image.load()
    except (UnidentifiedImageError, OSError, ValueError) as error:
        # A statement about THESE bytes, so the API must never retry it.
        return _refused(415, f"the bytes could not be read as an image: {error}")

    # The work itself is CPU bound and would block the event loop, so it runs on
    # a thread — with a bound, because a thread pool is not a queue.
    try:
        async with _slots:
            cutout = await run_in_threadpool(_cut_out, image)
    except Exception as error:  # noqa: BLE001 - the answer is the same either way
        LOG.exception("background removal failed")
        # 500, not 4xx: the API reads 5xx as "try again later", which is the
        # right answer for a model that fell over on an image it could read.
        return _refused(500, f"the model failed on this image: {error}")

    if cutout is None:
        # Nothing to remove. The API spells this SKIPPED and stops asking.
        return Response(status_code=204)

    return Response(content=cutout, media_type="image/png")


def _cut_out(image: Image.Image) -> bytes | None:
    """Runs the model and answers PNG bytes, or `None` for "nothing to remove"."""
    result = remove(image.convert("RGB"), session=_session)
    rgba = result if result.mode == "RGBA" else result.convert("RGBA")

    alpha = np.asarray(rgba.getchannel("A"))
    if alpha.size == 0:
        return None

    kept = float(np.count_nonzero(alpha > ALPHA_FLOOR)) / float(alpha.size)
    if kept < MIN_SUBJECT_RATIO:
        LOG.info("no subject found (kept %.4f of the pixels)", kept)
        return None

    buffer = BytesIO()
    # PNG because alpha is the entire point of the answer; the API flattens it
    # onto white and re-encodes as JPEG on the way to disk.
    rgba.save(buffer, format="PNG", optimize=False, compress_level=1)

    return buffer.getvalue()


def _refused(status: int, reason: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": reason})
