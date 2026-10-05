# Photos

A storage unit holds at most one photo; an item holds up to ten, ordered, first
one is the cover. Files live on `WAYMARK_PHOTO_ROOT`, a plain directory mounted
as a Docker volume — no S3, no MinIO, and no blobs in SQLite, which would turn
the one file you want small enough to copy anywhere into tens of gigabytes.

- **The bytes decide the format, never the header.** `Content-Type` is a string
  the client picked about bytes the same client picked. Signatures are sniffed,
  and only JPEG, PNG and WebP are accepted. SVG is refused because it is a
  document that happens to draw.
- **EXIF is stripped, orientation first.** Phone photos carry GPS, and this
  service is internet-reachable and serves the photos back. The order matters: a
  phone held upright records landscape pixels plus a tag saying "turn me", so
  stripping the tag before honouring it leaves every portrait photo sideways.
- **A thumbnail is written at upload.** A grid of 200 items over mobile data is
  the first screen anybody opens.
- **Serving needs a session**, streams instead of buffering, and is cached
  `private` — never `public`, because a shared cache must not hold the inside of
  a house. A stored file never changes, so thumbnails and settled photos are
  `immutable`; the one exception is a photo still waiting for its background to
  be removed, where the same id is about to start serving a different file, so
  it revalidates instead (ADR 10).
- **A thing carries its photos, not their ids.** `ItemView.photos` is a list
  of whole `PhotoView`s, ordered, first one is the cover, and a unit's own
  screen answers with `unit.photo` — so no client builds a `/photos/:id` by
  hand, and every screen can say which picture is still waiting for a
  background removal that may never happen.

  A photo appears only where a unit is the SUBJECT of the answer: its own
  screen, a patch, a move, an upload. A breadcrumb step, a child row, a node
  of the tree and a search hit are rows about somewhere else, and they carry
  no photo — and no photo id either, because an id is not a picture. It
  cannot be drawn without building a URL and it says nothing about whether
  the bytes have settled, so the field could only ever be used wrongly. The
  rows got smaller rather than larger.
- **Deleting releases the files.** The rows go first, then the files, and a
  failed unlink is logged rather than thrown. A read-only volume must not make
  deleting an item impossible; a file with no row costs disk, a lost delete is a
  lie to the user.
