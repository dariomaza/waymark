# The rembg sidecar (ADR 4).
#
# It is the big container in this stack -- a Python runtime, onnxruntime and a
# ~180 MB model -- which is precisely why it is its own container and why the
# API does not depend on it being there.

FROM python:3.11-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    # Where rembg keeps its models. A VOLUME in compose, so the ~180 MB download
    # happens once and survives every restart and every image upgrade. Inside
    # the image it would be re-downloaded by each new container, over a home
    # connection, before a single photo could be processed.
    U2NET_HOME=/models \
    # onnxruntime and numpy both read this; the compose file sets it to match
    # the CPU budget the box can actually spare.
    OMP_NUM_THREADS=2

# `libgl1` and `libglib2.0-0` are what opencv links against even in its headless
# build; `curl` is for the container healthcheck and nothing else.
RUN apt-get update \
    && apt-get install --no-install-recommends --yes \
        libgl1 \
        libglib2.0-0 \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Requirements first: the layer that takes minutes is also the one that almost
# never changes, so editing `app.py` must not rebuild it.
COPY requirements.txt ./
RUN pip install --no-cache-dir --requirement requirements.txt

COPY app.py ./

# Not root. This service parses images from the internet for a living, which is
# the exact shape of process that should own nothing it does not need.
RUN useradd --system --uid 10001 --create-home rembg \
    && mkdir -p /models \
    && chown -R rembg:rembg /models /app
USER rembg

EXPOSE 8000

# `/health` answers 503 until the model is loaded, so this is genuinely "can it
# do the job" and not "is the process alive". The long start period is the first
# boot downloading the model on a home connection.
HEALTHCHECK --interval=30s --timeout=5s --start-period=600s --retries=3 \
    CMD curl --fail --silent --show-error http://127.0.0.1:8000/health || exit 1

# One worker. The model is loaded per worker, and a second copy of it on a
# homelab box buys nothing: the work is CPU bound and already uses every core.
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
