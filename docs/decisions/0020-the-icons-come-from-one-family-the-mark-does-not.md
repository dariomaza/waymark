# 20. The icons come from one family, the mark does not

- Status: accepted
- Date: 2026-09-23

Supersedes the inline rule in `apps/web/src/ui/atoms/icon.tsx`, and corrects
the example ADR 19 leaned on.

## Context

The owner said it plainly:

> Necesito que uses más iconos, le da personalidad a la web. Por ejemplo en el
> endpoint del MCP has vuelto a poner un botón gigante debajo del input, cuando
> poniendo un icono junto al input quedaría mucho mejor.

He is right, and it was the second time. The password reveal was the first: a
full-width lime block under the field, which is now a 48×48 icon inside it. The
copy control under the API address was the same mistake made again, three
screens away, by somebody who had read the first correction.

That is not two careless authors. It is a **structural** fact about the file
they were both working against. `apps/web/src/ui/atoms/icon.tsx` held ten
shapes — `waypoints scan search tree things box tag camera plus eye` — and
there was no `copy` and no `check`. When the shape a control needs does not
exist, the thing that always exists is a `<Button>` with a word in it. The
block button was the symptom; the thin set was the disease.

So the rule in that file had to be looked at, because it was the reason the set
was thin. It said, in as many words:

> No icon library. There are ten symbols in this product, and the smallest
> useful icon package is hundreds of kilobytes plus a dependency to keep
> current — for ten shapes that never change.

It is not an ADR. It is a comment, and it had been quoted as settled twice —
once in `apps/mobile/src/ui/atoms/icon.tsx`, once in ADR 19, which used it as
its example of the instinct that is usually right: *"The icons are drawn by
hand because nine shapes are not worth a package."*

## Decision

**The icon set comes from lucide. The product's mark does not.**

`lucide-react` in `apps/web`, `lucide-react-native` in `apps/mobile`, both at
1.47.0. `waypoints` stays hand-drawn in both atoms.

### Both halves of the old argument failed, and they failed differently

This matters more than the conclusion, because one half was a premise that
expired and the other was a category error — and only one of them was ever
true.

**"Ten shapes that never change" expired.** It was an observation about a
product that had ten screens, stated as though it were a property of the
product. The set needed `copy`, `check`, `close`, `pencil`, `trash`, `move`,
`rotate`, `chevronRight`, `key`, `signOut`, `globe` and `image` — twelve more
than "never change" predicted, in one afternoon's work, and the cost of not
having them was two shipped defects the owner had to report from his own
garage. A premise that a feature request falsifies was never a rule.

**"Hundreds of kilobytes" was a category error.** It measured the package on
disk and called it the bundle. `lucide-react` unpacks to about 30 MB because it
is 1,600 icons in individual ESM modules with source maps and three type
builds; what reaches a browser is the modules actually imported. Measured on
this app, with the production Vite build, before and after:

```
hand-drawn, 22 shapes   427.69 kB raw   130.46 kB gzip
lucide, 21 + the mark   433.26 kB raw   132.94 kB gzip
```

**+5.57 kB raw, +2.48 kB gzipped**, for twenty-one icons and lucide's shared
`Icon` component. The hand-drawn version of those same twenty-one shapes was
not free either — it was roughly 4 kB of path data in the same bundle — so the
true marginal cost of the library is closer to 1 kB gzipped than to the
"hundreds" the comment feared. The number is in this ADR rather than in a
commit message because the next person to propose removing the dependency
should have to argue against a measurement.

### What actually decided it was neither of those

If the only argument had been kilobytes, the honest answer would have been
"draw twelve more shapes", and that is what was being done when this decision
was reconsidered.

The argument that could not be answered by drawing is **drift**. There are two
icon files, one per client, and they are the same drawings written twice —
once in `svg`/`path` and once in `react-native-svg`'s `Path`. Nothing enforces
that they agree. They already did not: the phone had an `eyeOff` the browser
had never had, and the two `ICON_NAMES` arrays were kept in step by whoever
last remembered. Twelve new shapes meant twenty-four new hand-copied `d`
attributes, and a mistyped coordinate in one of them fails in exactly the way
this codebase hates most: it does not fail. It renders something slightly
wrong, on one platform, and nobody notices until the owner does.

`lucide-react` and `lucide-react-native` are generated from one source and
published in lockstep at the same version. The drawings cannot drift because
there is only one drawing. That is the argument, and it is the same shape as
ADR 19's argument for `@simplewebauthn`: hand it to the people whose mistakes
get found by somebody looking.

It helps that the family was already the one this set was imitating — 24-unit
box, round caps and joins, `fill="none"`, `stroke="currentColor"`. The set does
not change character; it stops being an impression of a character and becomes
it.

### The atom stays the seam, and that is the non-negotiable part

Nothing outside `ui/atoms/icon.tsx` imports from lucide, in either client.
Screens ask for `Icon name="copy"` exactly as they did, and the whole switch is
a diff in two files plus two `package.json` entries.

**The map's keys are ours and its values are lucide's.** `IconName` is the
product's vocabulary: `things` is what this app calls the tab where everything
you own lives, and it stays `things` whatever lucide decides to call a stack of
boxes. That is not decoration on the port — it is the thing that makes this
decision reversible, and the thing that would have made the original decision
reversible if anyone had tried. The atom was always a port. This is the first
time it has been used as one.

Two consequences follow and are worth stating:

- Lucide's own names never appear in a screen, a test, or a dictionary key. A
  rename upstream is a one-line change in one file.
- A screen that wants a shape with no name here **adds a name here**. Reaching
  past the seam is the one thing this arrangement forbids, because it is how a
  port stops being one.

### The mark is not for sale

`waypoints` — three rings on a descending path — is what stands for Waymark in
the top bar of both clients. It is the product's mark, not a symbol for a
concept.

Lucide ships a `waypoints`. Taking it would have meant the picture that means
*this product* was the same picture that means "routing" in a thousand other
products, which is the one thing a mark may not be. So it stays drawn in the
atom, in both files, and it is the single asymmetry in the map.

An exception nobody asserts is an exception somebody tidies away, so both
clients have a test that says the mark is not lucide's: the browser's checks
that the rendered `<svg>` carries no `lucide` class and has the mark's three
rings, the phone's checks for the mark's own path data. Someone completing the
map "for consistency" fails a test that tells them why.

This is also the one place where the drift problem the library solves still
exists — the mark's coordinates are written out twice. It is four shapes rather
than forty, it is the one drawing nobody will ever edit casually, and both
copies are asserted.

### Where lucide's shape is different from ours, and whether that was allowed

Nine names already existed and were re-pointed. Six are the same drawing by any
reasonable eye (`eye`, `search`, `tag`, `camera`, `plus`, `box`). Three changed
enough to be worth naming:

- **`tree`** (the Places tab) was three rounded rectangles with a stub of a
  connector between two of them. It is now `Network`: a parent joined to two
  children by a real bracket. It reads as a hierarchy, which is what a tree of
  storage units is, and the old one read as three tiles.
- **`things`** (the Things tab) and **`box`** (one storage unit) were both
  isometric cubes and were very nearly the same picture at 22px — a defect that
  predates this change and that nobody had written down. They are now `Boxes`
  and `Box`: several cubes against one. The silhouettes are now different at a
  glance, which is the whole job of a tab icon.
- **`scan`** was corner brackets around two small squares. It is now
  `ScanQrCode`, which is corner brackets around a code — the same idea, drawn
  by somebody who draws these for a living.

Two of lucide's choices were rejected, and for the same reason both times:

- **`KeyRound`** draws the key's bit as a `<circle r=".5" fill="currentColor">`.
  At 20px on a phone that hairline dot is a smudge, not a key. `Key` is used
  instead, which is all strokes.
- **`waypoints`**, above.

The hand-drawn `eyeOff` on the phone is replaced by lucide's, which is the same
crossed eye and is now guaranteed to match the `eye` beside it.

### One stroke weight, stated once

Lucide's default `strokeWidth` is 2. This app has always drawn at 1.7. The
weight is a constant in each atom and is passed on every icon, including the
hand-drawn mark, so the library and the mark cannot disagree.

The risk this creates is precise and small: one shape landing at a different
weight, in a set nobody would think to re-measure. Both clients already had a
test walking every name and asserting the 24-unit box and the weight; it was
written for a set drawn by hand and it is now the assertion that made the swap
safe. It is the only test here that did not have to change.

### What it costs

Named, because a decision that lists no cost has not been made:

- **A dependency in both bundles**, and one more thing to keep current. It is
  pinned at an exact version in both clients rather than a range, so the two
  cannot drift through a lockfile.
- **Part of the visual vocabulary now belongs to somebody else.** If lucide
  redraws `Boxes`, the Things tab changes without anybody here deciding it
  should. The mitigation is the pin and the map: a shape that becomes wrong is
  one line pointed somewhere else, or back to a hand-drawn path.
- **The test runner had to be taught one thing.** `lucide-react-native`
  answers the `react-native` export condition with `.mjs`, and `jest-expo`'s
  transform is keyed on `\.[jt]sx?$`, so the package needed BOTH an entry past
  `transformIgnorePatterns` and a transform that matches the extension. The
  jest config says so at length, because allowing it past the ignore patterns
  alone produces a byte-identical error and would cost the next person an hour.
- **The set is no longer self-contained.** A checkout with no network can no
  longer render an icon. That is already true of every other dependency this
  app has, and it is the first time it has been true of something visual.

## Consequences

- The vocabulary is twenty-two names on the browser and twenty-three on the
  phone, and growing it is now one import and one line in a map rather than an
  evening with a coordinate grid. The block button under the input has nothing
  to hide behind any more.
- `ui/atoms/icon.tsx` is the only file in either client that knows lucide
  exists. `IconName` did not change when the drawings did, which is the whole
  of the evidence that the seam is real.
- The two clients can no longer draw the same name differently, except for the
  one drawing they are both asserted on.
- ADR 19's aside — "the icons are drawn by hand because nine shapes are not
  worth a package" — is no longer true. The paragraph it sits in still is: this
  codebase does not add dependencies lightly, and the instinct it describes is
  right. It was applied to the wrong thing. Verifying a WebAuthn assertion is
  small, unbounded and silent when wrong; drawing a pencil is small, bounded,
  and fails by looking wrong to the person holding the phone.
- The measured cost of this change to the person who uses the app is 2.48 kB
  gzipped, once, and an app that stops making him report the same defect twice.
