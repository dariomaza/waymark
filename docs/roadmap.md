# Roadmap

What is decided but not built, what is known to be missing, and what has been
built but never proven where it matters. Read this before proposing work — the
reasoning for several of these already exists, and some "obvious" fixes have
been tried.

Keep it honest: when something here is done, delete it in the same commit; when
something is found unproven, add it.

## Proposed, awaiting a decision

### NFC tags alongside QR labels

A label's QR code encodes `<WAYMARK_PUBLIC_BASE_URL>/u/<publicId>` (ADR 12). An
NFC tag can carry exactly the same URL as an NDEF record, so:

- **Reading is almost free.** Android opens a URL from a tag with no app code at
  all, and the deep-link intent filter `app.config.ts` already derives would
  route it into the app. No domain change, no API change.
- **Writing is the real feature.** A screen that writes a space's URL to a tag,
  with the ugly cases handled: a read-only tag, one too small, a tag pulled away
  mid-write.
  - Phone: `react-native-nfc-manager` (native code; fine, the app is built on
    EAS).
  - Web: Web NFC (`NDEFReader`) exists only in Chrome/Edge/Opera/Samsung
    Internet on Android, over HTTPS, and needs a user gesture to write. No
    desktop, no Firefox, no iOS — the first feature that structurally cannot
    reach parity, which would need an ADR saying so.
- Tags cost money and must be touched; a QR is paper and reads from a metre
  away. They complement, they do not replace.

Suggested order: prove reading with a hand-written tag first, then decide
whether the writer is worth building.

## Known gaps between the clients

Found by the parity audit and confirmed still open:

- **The phone never says it is offline.** The PWA shows `shell.offline`; the app
  has no connectivity signal at all (no NetInfo) and only retries once.
- **The phone has no "nothing at this address" screen.** A stale deep link lands
  nowhere. The web has `not-found-screen.tsx`.
- **The web's "everything you own" list has no bulk selection.** The phone has
  it there (and inside a space); the web only inside a space.

## Built, never proven on a device

Tests assert styles and bytes; these need a person, a phone or a printer.

- **The camera upload fix.** Uploading a freshly taken photo failed on the
  owner's phone with "cannot reach Waymark" while picking from the gallery
  worked; the request never reached the API. The fix checks the file before
  upload and names a read failure as such. If the next attempt shows the new
  "could not read that photo" message, the cause is named in Android's own
  words. **If it still says "cannot reach Waymark", the file was readable and
  the likely cause is body size** — the next step is to downscale before
  uploading.
- **`ImagePicker.getPendingResultAsync` is never called.** Expo's docs require it
  on Android: an aggressive OEM can destroy the activity while the camera is
  open, and the photo is then lost silently on return.
- **The label sheet on paper** — that Android's print path honours A4, page
  breaks and the embedded SVG, and that a 36 mm symbol printed and photographed
  still scans.
- **Layout at 360 px**: the home screen's two buttons wrap their Spanish labels
  to two lines by design — confirm it is not three; "Escanear" in a five-tab bar
  (~72 px per tab).
- **48 px targets on the web**: stated in CSS, unmeasurable in jsdom.
- **The release pipeline end to end.** release-please's configuration was
  dry-run against the real repository, but no release PR has been merged yet,
  so `release.yml` has never run, and the `EXPO_TOKEN` secret has never been
  used.
- **The MCP server against a real API, driven by a real assistant.**

## Postponed improvements

- **The APK is 106 MB** because it carries all four Android ABIs. Per-ABI
  splits would cut it to about a third.
- **Passkeys cannot be used on a phone with no platform credential provider**
  (WebAuthn reports `NotReadableError`; webauthn.io offers only NFC/USB keys and
  another device there). Nothing to fix in Waymark; the app's keystore unlock is
  the answer on such phones.
- **The PWA manifest's `description` and `lang` are English only.**
- **The Spanish copy has had no native reviewer.**
- **`docker compose` warns the named volumes were not created by Compose.**
  Declaring them `external: true` would make the intent explicit.
