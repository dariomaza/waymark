---
layout: home

hero:
  name: Waymark
  text: Find your way back.
  tagline: Self-hosted inventory for a home or homelab. Register storage units, record what is inside them, and find anything again by scanning a QR label or searching.
  actions:
    - theme: brand
      text: Run it
      link: /self-hosting/
    - theme: alt
      text: Product tour
      link: /product/search
    - theme: alt
      text: Decisions
      link: /decisions/

features:
  - title: Spaces inside spaces
    details: A shelf holds a crate, the crate holds a box. Storage units form a tree, and a move that would put a unit inside itself is refused.
    link: /architecture
  - title: A label on every box
    details: Each unit gets a printed QR code. Scan it and the box answers what is inside, on the phone or in the browser.
    link: /product/labels
  - title: Search that answers
    details: '"Where did I put it" by name, tag, unit or location, ranked so the likely answer comes first.'
    link: /product/search
  - title: Two clients, one API
    details: A PWA and an Android app over the same API, served from one container behind one hostname.
    link: /android
  - title: Ask an assistant
    details: An MCP server lets an assistant find things, and add them only after you confirm.
    link: /mcp
  - title: Yours to host
    details: One Docker container, two volumes, optional background removal for photos.
    link: /self-hosting/
---


A waymark is the marker a walker leaves on a trail so the route can be
retraced. Stick one on a box and the box has an address.

## Why the name changed

This was called **Ariadna** until it was renamed, after the thread that leads
out of the labyrinth: the house was the labyrinth and the app was the thread.
That reading was not wrong, but it was a metaphor — it needed a myth to
explain itself, it cast the house as an adversary, and the thread is the one
part of the story that is not a thing you leave behind on purpose.

A waymark is not a metaphor. It is a physical marker, left deliberately, so
that somebody can find their way again — which is exactly and literally what a
printed QR label glued to a box is. The name stopped describing the product by
allusion and started describing it by definition, and that is why it is
better.

The rename was done while the inventory was still empty and no label had been
printed. It would not have been free afterwards: a printed `publicId` is glued
to a box, so the id scheme and the `/u/<publicId>` address it resolves through
were deliberately left untouched by the rename and will stay untouched.

## Problem

Things get stored and then lost. Not lost as in gone, lost as in "it is
somewhere in one of forty boxes". Waymark makes every storage unit addressable
via a printed QR code and every item searchable.

## Scope

**Storage units** — name, location, description, photo, generated QR code.
**Items** — name, description, one or more photos, and a parent storage unit.
Items can be created, deleted, and moved between units.
