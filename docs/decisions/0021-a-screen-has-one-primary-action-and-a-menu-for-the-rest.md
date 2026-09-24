# 21. A screen has one primary action, and a menu for the rest

- Status: accepted
- Date: 2026-09-23

Retires the inline promise in `apps/web/src/units/views/unit-detail.css` —
"two per row on a narrow phone, never a single cramped column" — which was an
answer to the wrong question.

## Context

The owner said it for the third time:

> Sigo viendo muchos botones enormes, unos debajo de otros. A nivel de diseño
> podríamos darle una vuelta.

The first two were the password reveal and the copy control beside the MCP
address. Both were full-width blocks; both are now 48×48 icon controls sitting
inside or beside the thing they act on. ADR 20 treated those as a vocabulary
problem — the icon set was too thin to say `copy`, so the shape that always
exists is a `<Button>` with a word in it — and widened the set.

That diagnosis was right and incomplete. Widening the vocabulary stopped the
next block button from being born. It did nothing about the ones already
standing in a row.

### The screen he is describing

`UnitScreen`, on a phone, offered **nine actions at identical visual weight**:

```
units.addItem   units.addInside   units.searchInside
action.edit     action.move       action.delete      action.empty
units.showLabel label.sheet
```

One of them was `tone="primary"` and one was `tone="danger"`. Every one of the
nine was the same height and the same corner radius, and every one of them was
handed the same share of the row by one line:

```css
.unit-detail__actions .button {
  /* Two per row on a narrow phone, never a single cramped column. */
  flex: 1 1 8rem;
}
```

The item screen carried the same line, for three actions, the last of which
deleted the thing.

### Why no value of that property was the answer

The obvious fix is to change the number, and it is worth saying why the number
was never the question.

`flex: 1 1 8rem` asks for a 128px basis, a share of whatever is left over, and
permission to shrink. What a phone actually does with nine of those at 360px,
in Spanish, depends on each button's min-content width, on where the text is
allowed to wrap and on how the free space is shared — and **that was not
measured in a browser for this ADR**. The owner's report is the evidence that
the outcome is bad; a pixel table nobody took would be worse than no table.

It does not need measuring, because every outcome the property can produce is
the same failure:

- Two per row at 160px each, with "Añadir un espacio dentro" wrapping to three
  lines inside a 48px-tall rectangle.
- One per row, stretched full width, which is the single cramped column the
  comment was written to prevent.

Both are nine controls of the same height, the same radius and the same weight,
and in both a person has to READ the whole set to find the one they want.
Raising the basis makes the first outcome worse; lowering it does not help,
because a flex item will not shrink below its own min-content size anyway;
`min-width: 0` buys room by truncating the labels, which is a worse answer than
either. The property is being asked a question it cannot answer:

> Nine peers cannot be laid out well, because the layout is being asked to
> express a priority the design never decided.

That is the whole diagnosis. The count is the defect; the CSS is where it
became visible.

## Decision

**Every screen has exactly one primary action, at most one secondary beside
it, and one overflow control holding everything else. An action that belongs
to a THING rather than to the screen goes in that thing's menu, beside its
name.**

Concretely, in both clients:

1. **One primary.** The thing the screen exists for. It is the only
   `tone="primary"` on the screen — the only lime rectangle — and it is what
   the eye lands on before anybody has read a word.
2. **At most one secondary.** A second control, in the outlined tone, when
   there is genuinely a second common intention. Not two. Not "the other five
   are also quite useful".
3. **Everything else behind one overflow.** An icon-only control (`more` in
   the icon vocabulary: vertical dots) that opens a panel of full-width lines.
4. **Nothing that takes something away goes in the row.** `delete` and `empty`
   live in the overflow, at the far end of it, behind a rule and a gap.
   Distance is the only guard a touch screen has: there is no hover to
   hesitate in and no cursor to aim with, and 48px is how far a thumb misses.
5. **The overflow sits beside the subject's name, not in the action row.**
   Renaming a box, moving it or throwing it away are not things you do on the
   unit screen; they are things you do to the box the screen is showing you.

### Where each of the nine went

| Action | Before | After |
| --- | --- | --- |
| `units.addItem` | peer, `primary` | **primary**, in the row |
| `units.addInside` | peer | unit's menu (see the amendment below) |
| `units.searchInside` | peer (link) | **secondary**, in the row |
| `units.showLabel` | peer (link) | unit's menu |
| `label.sheet` | peer (link) | home screen only (see below) |
| `action.edit` | peer | unit's menu |
| `action.move` | peer | unit's menu |
| `action.empty` | peer | unit's menu, destructive group |
| `action.delete` | peer, `danger` | unit's menu, destructive group |

On the item screen: `action.edit` is the primary, `action.move` stays beside it
as the secondary, `action.delete` goes to the item's menu. Move is the one
choice here that is not obvious, and it is deliberate — a thing that has moved
and has not been recorded as moved is the single failure this whole product
exists to prevent, so recording it must cost one tap and not two.

On the phone the same rule catches one more: `items.selectSeveral`, the
visible way into a bulk move, is a line in the unit's menu. The long press
that also starts it is unchanged.

The home screen needed no change. It already had exactly one primary and one
secondary, which is some evidence that the rule was latent in the codebase and
only the detail screens had drifted.

### Amended: a secondary PLACE is not a secondary action

That last paragraph was wrong, and wrong in a way the rule as written could not
catch. The home screen's two controls were an outlined rectangle beside a lime
one — one primary and one secondary, exactly as required — and the owner looked
at it on his phone and said:

> lo mejor sería el botón principal en grande y lo de las etiquetas en
> pequeñito con un icono al lado

The count was right and the SHAPE was wrong. Adding a room is what the home
screen is for; a sheet of labels is a different errand that happens to start
there. Two rectangles side by side say the two controls are the same kind of
thing, so a person reads both to find out which is which — which is the failure
this whole ADR was written to end, at two controls instead of nine.

So the vocabulary gains a third shape, `QuietLink` (`ui/atoms/quiet-link.tsx`):
a word with a picture beside it, no fill and no edge, for **a second PLACE
rather than a second action**. The primary takes the full width; this sits under
it at its own size.

Three rules come with it, and the first is the one that gets broken:

1. **It is small to look at and not small to hit.** The 48px floor is
   unchanged. Visual weight and touch area are different measurements, and this
   is the shape where they are easiest to confuse: small text beside a small
   picture looks like something that should be the height of a line of text.
2. **Its picture is required**, unlike a `Button`'s. A control with no
   rectangle around it has nothing but its words to say it is a control at all,
   and small words alone read as a caption. Where no honest picture exists,
   widen the icon set (ADR 20) — `tags` was added for exactly this, and is to
   `tag` what `things` is to `box`.
3. **It is a route, never an act.** Anything that does something to what the
   screen is showing belongs in that thing's menu, which is the other half of
   this ADR. `QuietLink` is for a way somewhere that the screen is not for.

The other place it belongs today is `photos/views/photo-status-note.tsx`, where
"See the ones that failed" is a `Button` in `quiet` tone doing this shape's job
with a button's clothes on. That is left alone here only because nobody has
complained about that screen, and a redesign nobody asked for is how the row of
nine got built.

~~Printing is a browser errand, so `apps/mobile` has no label sheet and needs
none of this. The two clients still agree on what a screen offers; they differ
on what a phone can do with a printer.~~

**Reversed. See "Amended: a phone prints" below.**

### Amended: which second control a box gets

The rule above survives this unchanged — one primary, at most one secondary —
but the first pair chosen under it was wrong, and the owner said so after a
week with it on his phone:

> dentro de un espacio, quiero que las acciones principales sean buscar y
> añadir un objeto

He is right, and the original reasoning contains its own refutation. "A shelf
holds things a hundred times for every time it grows a drawer" is the argument
that made adding an ITEM the primary; applied once more it says that the
second-commonest reason to open a box's screen is not growing a drawer either.
Somebody who has walked to a shelf and opened it is putting something in it or
looking for something in it. So `units.searchInside` is the secondary and
`units.addInside` is the first line of the menu.

This is a swap and not a widening: the row still holds two controls, and the
count that made nine unusable is unchanged. It is worth naming as an amendment
rather than a silent edit, because it shows what this rule can and cannot do —
it decides HOW MANY controls a screen shows and says nothing about WHICH, and
only the person using the app knows that second part.

The phone answers the same sentence by GAINING something. `apps/mobile` had no
scoped search anywhere: its search tab has read a `within` parameter all along
and nothing in the app ever passed one, so the browser's version was behind a
menu and the phone's existed only in the navigator's types. The two clients now
offer the same pair — a URL in one and a navigation in the other, which is each
platform's own business. **Intent is what the two clients owe each other;
mechanism is not.**

### Amended: what belongs in a subject's menu at all

The rule says an action belonging to a THING goes in that thing's menu. It does
not say what to do with something that is not an action on the thing, and one
line slipped through on that silence. The owner found it:

> tampoco tiene sentido que en las acciones de un espacio puedas ver todas las
> etiquetas, con ver la del propio espacio es suficiente

`label.sheet` was a page of labels for everything a box HOLDS, scoped with
`?within=`. `units.showLabel` is the box's own label. The two were adjacent
lines wearing almost the same words, and only the second is about the box. A
sheet is a job you do for the whole house, standing at a printer, so it lives
on the home screen and nowhere else.

**A subject's menu holds what is done TO the subject. A different errand that
happens to mention the subject is not that, however convenient the shortcut.**

Nothing became unreachable. The shortcut saved was "labels for everything in
the garage", and the sheet's own screen does that in one press — the subtree
control beside each room, which has its own test. The narrowed address is still
honoured for anybody holding one; nothing builds it any more, so
`labelsWithinPath` is gone.

### Amended: a phone prints

- Decided by: the owner, 2026-09-24.

The struck-out paragraph at the end of "a secondary PLACE is not a secondary
action" was never true.

**What was claimed.** That printing is a browser errand; that `apps/mobile`
therefore has no label sheet and "needs none of this"; and that the two clients
differ only "on what a phone can do with a printer". It was written as a fact
about the platform and it was an assumption about the platform, made without
looking.

**What turned out to be true.** `expo-print` exists. It ships Android printing
and PDF generation, it is published in lockstep with the SDK this app is on,
and `expo-print@57.0.2` matches `expo@~57.0.24`. It has been installable for
the whole life of this client. Android's own print service has been in the
platform since 4.4 and every modern Android phone can print to a network
printer or save to PDF from the same dialog. Nothing about a phone made the
sheet impossible; nobody had checked.

**Who decided.** The owner, with both clients side by side on his one phone:

> Aparte de que son diferentes no me gustan, la app no tiene las hojas de
> etiquetas y quería que fueran dos botones en línea.

He did not argue about `expo-print`. He noticed that one of his two clients
could do something the other could not, on one device, and that is the whole
argument — the same argument ADR 22 is built on.

**What it cost to be wrong about it.** A feature the owner wanted was absent
for the life of this client, and the absence was written down as a decision, so
nobody re-opened it. That is the specific danger of an ADR: a claim recorded
beside real reasoning borrows the reasoning's authority. This one sat inside a
document that had measured a bundle and counted nine buttons, and it had
measured nothing.

**What is true now.** The sheet exists on both. The paper's geometry — the page,
the grid, the 36mm symbol, the type sizes and the four printed colours — is
`LABEL_SHEET` in `@waymark/tokens`, read by the browser's stylesheet as custom
properties and imported by the phone's renderer, so the two cannot draw
different paper. `flattenUnits`, `subtreeOf` and `qrSvg` were already shared and
are shared here. What genuinely differs is one thing: the browser lays the page
out in the document it is already showing and calls `window.print()`, and the
phone builds the same page as a document and hands it to the platform, whose own
dialog is the preview. Intent is what the two clients owe each other; mechanism
is not.

The phone's printer is a PORT — `units/printer.ts` — like the camera, the
keystore, the photo library and the clipboard, and for the same reason. What
crosses it is a string of HTML, which keeps "which units" and "what a label
says" on this side of the boundary where a test can read them.

`label.printFromWeb` is deleted. It told the owner to print from the web client,
and a sentence that stops being true is worse than no sentence.

### Amended: the home screen's two controls are a row of two

- Decided by: the owner, 2026-09-24.

This is the third shape that screen has had, and each one was his.

1. Two rectangles side by side. He looked at it and said *"lo mejor sería el
   botón principal en grande y lo de las etiquetas en pequeñito con un icono al
   lado"*, which produced `QuietLink`.
2. A full-width primary with a small quiet link under it. He put both clients on
   one phone and said *"quería que fueran dos botones en línea"*.
3. Two rectangles side by side, at equal width, the primary lime and first.

It is worth saying plainly that (3) is close to (1), and that the rule this ADR
states did not decide any of the three. The rule says how MANY controls a screen
shows; it has never said what shape they are. What settled it each time is the
person using the app, which is the same admission the second amendment above
makes about WHICH two a box gets.

**What is different this time is that the failure mode was named in advance.**
The row of two collapsed once before, and this ADR recorded why: `flex: 1 1 8rem`
had no way to be told not to wrap, so once "Añadir un espacio" outgrew the basis
the row became one control per row — the single cramped column the comment beside
it existed to prevent. So the row is a GRID of two tracks on the browser, which
has nothing to wrap with, and two `share` buttons in a row on the phone, which
has no grid. At 360px each track is 156px, both Spanish labels take two lines,
and both rectangles stay the same height because the grid stretches them and
because the phone's peers fill their row. Wrapping a label was chosen over
truncating one: half a word is not a word.

`QuietLink` survives. It is drawn in `photos/views/photo-status-note.tsx` on both
clients — the second site this ADR named for the shape and ADR 22 closed — so it
is not a dead atom, and the argument in it is still the right argument for a
quiet way somewhere. The home screen simply is not that case any more.

### Why the overflow opens a sheet, and not an ARIA `menu`

A true `role="menu"` is a roving `tabindex` and a set of arrow-key behaviours
that nobody in a two-client codebase will implement identically twice. The
reward for getting it right is a small list hanging off a control near the TOP
of the screen, which on a phone held one-handed is the part of the screen a
thumb cannot reach.

`Sheet` is already the answer to both halves. It comes up from the bottom,
where the thumb is. It already traps Tab, closes on Escape, hands the focus
back to the control that opened it, and portals itself out of the sticky
chrome that once cut a panel in half on a real phone. Every question this app
asks is asked with it, so an overflow that invented its own panel would be the
one panel in the product that behaved differently.

So the control declares `aria-haspopup="dialog"` — which is the truth — and
carries `aria-expanded`, and the lines inside are ordinary buttons and links
that a keyboard already knows how to walk. On the phone the same panel is a
`Modal` with `accessibilityViewIsModal`, so a screen reader stops at its edge,
and `onRequestClose`, so the back gesture closes it like everything else.

An icon-only control has no accessible name of its own, and "More" is not a
name either — it does not tell two controls on one page apart. So the name
comes from the dictionary and names the subject: `action.more` is "More
actions for {name}", and the SAME string is the heading of the panel it opens,
so what a screen reader announces and what the heading says cannot drift.

### `destructive` is not `tone`

The overflow's action shape carries both, and they answer different questions.
`tone` is what a line LOOKS like; `destructive` is what it COSTS.

`action.empty` is the case that forced the split. Emptying a box moves its
contents up into its parent and deletes nothing, so painting it in the danger
colour would be a lie — but what it costs is measured in where everything you
own ends up, and that belongs at the far end of the menu with `delete`. One
flag could not have said both.

## What it costs

Named, because a decision that lists no cost has not been made.

- **One tap became two.** Editing a box, moving it, printing its label: each
  of those now costs an extra press. That is the price of the primary being
  findable without reading, and it is charged to the things somebody does
  rarely — but it IS a price, and somebody labelling a whole garage in one
  afternoon will feel it on every box.
- **An overflow is a place to hide things.** The rule says what goes in it; it
  cannot stop somebody putting a tenth action there instead of asking whether
  the tenth action should exist. A menu that grows to fifteen lines is the
  same disease one level down, and it will look tidier while it happens.
- **A dialog is more ceremony than a dropdown.** Opening the menu dims the
  whole screen to offer seven lines. On a desktop browser that is heavier than
  the interaction deserves. It was accepted because this app's screen is a
  phone in a garage and the desktop is where it is merely also usable.
- **The overflow is now the only way to a shortcut somebody had.** Printing
  labels for everything in one room was two presses from that room and is now
  two presses from the home screen, by way of the subtree control. Equal in
  count, further in distance for somebody standing in front of the room — and
  charged deliberately, because the alternative is a box's menu that offers
  things which are not about the box.
- **A second renderer for one piece of paper.** The sheet is now drawn by a
  stylesheet on the browser and by a string of generated HTML on the phone. The
  measurements cannot drift — they are one object in `@waymark/tokens` — but
  the two RENDERERS can: a rule one engine honours and the other ignores would
  show up as a page that looks right in one place and comes out of a printer
  wrong in the other. Nothing in either test suite prints anything; the phone's
  page is asserted as bytes handed to the platform, which is the last thing this
  app is responsible for and not the same as ink on paper.
- **One menu with one line in it.** The item screen's overflow holds only
  `delete`. That looks like ceremony and is not: the rule is not "hide the
  rarely used", it is that nothing destructive may sit where a thumb reaching
  for the primary can land on it. The alternative — leave the bin in the row
  until there are enough lines to justify a menu — is exactly how the unit
  screen got to nine.
- **Two components per screen instead of one.** `UnitActions` and `UnitMenu`,
  `ItemActions` and `ItemMenu`. They own separate sheet state and share
  nothing, which is why they are two files rather than one with a prop; the
  cost is that "what can I do here" is now answered in two places.
- **The tones are not covered by a test.** Which control is lime is
  appearance, not behaviour, and this codebase does not assert class names. A
  test can prove that `delete` is not reachable until the menu is opened, and
  one does; nothing proves that `addItem` is the primary except reading the
  file. That gap is accepted rather than closed with a render assertion.

## Consequences

- `apps/web/src/ui/molecules/overflow-menu.tsx` and its phone twin are where
  the rule lives. The next person adding a tenth action to a unit adds a line
  to an array, and the array is in a file whose whole doc comment is about why
  it exists.
- `units.showLabelPhone` is gone. It existed only because the browser's
  version of that control was one button in a row of nine and a verb would not
  fit; both clients now say "Show the label" from `units.showLabel`. A key
  born of a cramped row should die with the row.
- `flex: 1 1 8rem` becomes `flex: 1 1 10rem` on both detail screens. The basis
  can be honest now that it is describing two controls that are not peers — and
  if it ever fails again, two rows of one is a primary above a secondary, which
  is still a hierarchy rather than a wall.
- The phone's `Button` gained a minimum WIDTH to match its minimum height. A
  control that has dropped its word for a picture has nothing but its padding
  left to keep it wide enough to hit, and the browser's atom had said so since
  it was written.
- Nothing a person could do before has become impossible, and the tests say so
  in those terms: the ones that used to press a button in a row of nine open
  the menu first and are otherwise unchanged, and one of them is called "can
  still delete a box, from behind the overflow".
- `apps/mobile/src/units/label-sheet-screen.tsx` is the phone's half of a
  feature this document said the phone did not need. Its doc comment says what
  it shares with the browser's and what it does not, which is the shape every
  "two clients, one product" file in here should have.
- The four reports the owner has now made are one report. ADR 20 answered the
  half about the vocabulary; this answers the half about the arrangement. If
  there is a fourth, it should be read as evidence that a rule is missing
  rather than that a screen is untidy.
