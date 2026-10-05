# QR codes

Every storage unit has a `publicId`: ten characters of Crockford Base32, printed
under the symbol so it can be read aloud across a garage. The QR itself encodes
`<WAYMARK_PUBLIC_BASE_URL>/u/<publicId>` — a URL, never a bare id, because
Android's stock camera offers to OPEN a URL and offers to copy a string, and
"install the app, open it, then scan" is the workflow the label exists to avoid.

Error correction is **level Q**, 25%. L is sized for a symbol on a screen and one
scuff turns the label into decoration. H is not simply better: more redundancy
means a larger symbol, so at a fixed sticker size every module gets smaller until
the camera stops resolving them. A test scrubs out a square of the symbol and
asserts Q still decodes where both L and M lose the URL.

## The label sheet

One label at a time is a workflow that never happens: open the box's screen,
open its label, print, go back, sixty times. So `/labels` in the web client
prints a sheet, and the real job — label the whole storage room in one
afternoon — is tick a room, print, cut, stick.

**A label is not just a QR.** Standing in front of twenty boxes, a wall of
identical squares means scanning every one of them; a name means reading the
wall. So the name is first and biggest, then the symbol, then the `publicId`
for the day a label is scuffed past what level Q can recover, then where the
unit lives — small, and not for the person holding the box but for the ten
minutes between the printer and the glue, when twelve cut-out squares have to
be matched to twelve boxes, three of which are called `Box 3`. The KIND is
left off: "Box" on a label glued to a box costs a line and tells nobody
anything they cannot see.

**Which units** is a selection, a subtree, or both. "Everything inside the
garage" is one press because a location IS a storage unit (ADR 1) and the
forest the app already loads makes the subtree free; `?within=` from a unit's
own screen means what it means on a search — inside, not the unit itself
(ADR 11). Printing all sixty every time would be as useless as printing one.

**Plain A4 and scissors**, no proprietary label stock. 10mm side and 12mm
top/bottom margins leave 190 × 273mm, which is 3 × 4 labels of 63 × 68mm. That
count is a scanning decision, not a packing one: the payload is around 35
characters, which at level Q is a 33-module symbol plus its quiet zone, 41
across, and printed at 36mm that is 0.88mm per module — comfortably past the
~0.4mm where phone cameras give up, with a long hostname still leaving 0.73mm.
Eighteen to a page matches an off-the-shelf label sheet and was rejected: the
cell is then 46mm tall, and either the symbol or the name has to give.

The pages are chunked in code rather than left to the printer. `break-inside:
avoid` stops one label being cut in half but not a whole row being pushed onto
the next page, and a preview that disagrees with the paper is worse than no
preview. Twelve to a page, the break between them, so the preview IS the
pages — shown at real size, in a container that scrolls sideways on a phone.

A sheet will not print until every symbol has been fetched. Each one is behind
the session like every other image, and a print dialog opened with three still
in flight puts blank squares on paper that somebody then cuts up.
