# 24. The mark is the name, with a pin over its w

- Status: accepted
- Date: 2026-09-29

Supersedes the mark in ADR 20 — *The mark is not for sale* — and nothing else
in it. The icon family, the seam and the stroke weight stand.

## Context

ADR 20 kept `waypoints` — three rings on a descending path — drawn by hand in
both icon atoms, on the grounds that lucide ships a `waypoints` of its own and
the picture that means *this product* may not also mean "routing" in a
thousand other products.

The argument was right and the drawing lost it anyway. Lucide's `waypoints` is
three circles joined on a path; ours was three rings joined on a path, drawn
at the same stroke weight in the same box. Hand-drawing a near-identical
picture keeps the file ours and the meaning theirs. And the meaning was the
wrong one: three waypoints read as a route, a graph, a journey — nothing in
Waymark is a route. It is a house, boxes in it, and a label on every box.

The owner commissioned a mark from that last fact, and approved it as final.

## Decision

### What it is

The name is the logo: "waymark" in Sora SemiBold, and over its w the corner
square of a QR code — the finder pattern, the part of the label everybody has
seen — turned into a location pin. A rounded square with one corner left
sharp, rotated 45° so that corner points down at the w. **The label on the box
is the place you are looking for.**

- **The logo** is the whole name with the pin. It is what the top bar of both
  clients shows, in place of the old pair of a mark and the word typed beside
  it — the logo already is both. The heading keeps its accessible name,
  `Waymark`, a proper noun that is not translated.
- **The symbol** is the w and the pin alone. It is the launcher icon, the
  launch screen and the installed PWA's icons.
- **The small cut** is the symbol with a SOLID pin. At 24 pixels and below the
  ring's hole is under a pixel and the core two, and they close up into a
  smudge. So anything at icon size — the `pinnedW` entry in both icon atoms,
  the browser's favicon — draws this cut, and everything larger draws the
  full one.

### How it is built

- **Sora SemiBold 600**, tracking −2 %, converted to outlines. Sora is under
  the SIL Open Font License 1.1, which permits using the font in a logo; as
  outlines, no font file ships with either client and nothing is embedded.
- **The pin**: a 140-unit rounded square, corner radii 40 (outline), 12 (the
  ring's hole) and 8 (the core), ring 30 and gap 18; 0.78 × the x-height wide,
  0.08 × the x-height above the w's right arm.
- **All fills, no strokes.** It is a letterform, and a letter is an outline.
  It is the one drawing in the icon atoms that is not on the 1.7 stroke, and
  both icon tests now hold it to the 24-unit box and not to the weight.

### Where the numbers live

`packages/tokens/src/mark.ts`, once. `LOGO` is the name in font units, the
kit's letter paths unchanged; `MARK_SMALL` is the small cut in the icon box.
The kit places the pin with a transform; that transform is applied in the file
rather than carried, and its derivation is written above the numbers.

This closes the one drift ADR 20 left open. The old mark's coordinates were
written out twice, once per atom, "kept honest by hand". Both atoms, both top
bars and the favicon now draw from these exports, and their tests compare
what they draw with them. The Android source `apps/mobile/assets/pinned-w.svg`
is the one copy that cannot import them — ImageMagick needs a file, in a large
coordinate box and with no transforms (its head says why) — and it is derived
from the same numbers, not traced.

### Colour

Unchanged: the accent lime `#c8f04a` on the ink `#101011`, from
`packages/tokens` in both clients. **Never lime on white** (1.26:1): on a
light surface the mark is ink. The browser's light scheme is the one place
that applies — its top bar draws the logo in `--color-ink` there, not in the
darker green `--color-accent-text` becomes, which is the colour of a link.

### The name of the icon

`pinnedW`, in both atoms. Named for what is drawn, as every name in the set
is: `thread` and then `waypoints` were each left naming a drawing that no
longer existed. When this drawing changes, the name should change with it.

## Consequences

- The PWA icons were found to be older than `waypoints`: they still drew the
  thread, two marks ago, because no test looked at `public/`. They are
  replaced, and a test now checks that every icon the page and the manifest
  name is there at its declared size, and that the favicon is the small cut.
- The logo kit's own `waymark-logo.svg` frames the drawing 21 units short at
  the bottom and cuts off the tail of the y. `LOGO` uses the drawing's real
  box, and a test holds every point inside it.
- The loading atom is unchanged: it is a pulsing dot, not the mark, and its
  argument — the product's vocabulary rather than the platform's — only
  cited the old mark as the example.
- The console greeting prints the word, not the mark, and is unchanged.

## What it costs

- **A second drawing that is not an icon.** The logo is four and a half
  squares wide, so it is its own atom (`logo.tsx`) in each client rather than
  an entry in the icon set, and the top bar's `title` became a node on the
  browser.
- **Detail that is small in the bar.** At the bar's 24 px the pin's ring is
  about two pixels and the gap one. It reads on a phone's density; on a
  one-times screen the ring and core are close to the limit the small cut
  exists for. The brand's own minimum for the logo, 80 px wide, is met at
  87.
- **No trademark search has been done.** Nobody has checked whether a mark
  like this is already registered. That is recorded rather than solved.
- **The kit is outside the repository.** `mark.ts` is the copy that counts
  now; a revised kit means re-deriving it, the favicon and the Android source,
  and re-running `render-icons.sh`.
