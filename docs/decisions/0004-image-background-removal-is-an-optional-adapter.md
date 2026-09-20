# 4. Image background removal is an optional adapter

- Status: accepted
- Date: 2026-09-20

## Context

Putting a white background behind item photos is a secondary nice-to-have.
The usual implementation, `rembg`, pulls in Python and a ~180MB ONNX model.
Embedding that in the API would make a cosmetic feature part of the critical
path for registering an item.

## Decision

Background removal runs as its own container behind an `ImageProcessor` port.

`Photo` stores `originalPath` (always written, synchronously) and
`processedPath` (nullable), plus `processingStatus` of
`PENDING | DONE | FAILED | SKIPPED`. Processing is asynchronous and may be
retried later.

Reads always fall back to `originalPath` when `processedPath` is null. If the
sidecar is stopped, unreachable or simply disabled, item creation succeeds and
the original photo is shown.

## Consequences

- The API container stays small and has no Python or ML dependency.
- The sidecar can be turned off entirely on constrained hardware.
- `FAILED` photos need a retry path, otherwise they stay unprocessed forever.
- The domain never depends on processing having happened.
