#!/bin/sh
#
# Rasterises `waypoints.svg` into the three PNGs `app.json` names.
#
# Run it from this directory, after changing the mark:
#
#     sh render-icons.sh
#
# The PNGs are committed beside the SVG, because an EAS build has no
# ImageMagick and `expo prebuild` reads files rather than generating them. They
# are output all the same: nobody should ever edit one by hand.
#
# `magick` is ImageMagick 7. It is the only rasteriser here — there is no
# librsvg delegate and no `sharp` — which is why the source SVG is written the
# way it is; see the comment at the head of it.
#
# # The three sizes, and why they are different
#
# Everything is composed onto a 1024×1024 canvas, which is what Expo expects to
# be handed and downscales to every density itself.
#
# `icon.png` is the square, opaque icon: the legacy Android launcher icon, and
# the one a store listing shows. The mark takes 62% of the width, which is
# about what a square icon wants before the launcher's own rounding eats the
# corners.
#
# `adaptive-icon.png` is the foreground layer of the Android adaptive icon, and
# it is the one that is easy to get wrong. Android hands the 1024 square to the
# LAUNCHER, which masks it to a circle, a squircle or a rounded square of its
# choosing and may also animate it. Only the inner 66dp of the 108dp grid — a
# CIRCLE, 61% of the width — is guaranteed to survive every mask. So the size
# here is not chosen by eye: the mark's circumscribed circle is 2546.9 of the
# SVG's 2400 units across, and 588 is the largest render whose circumscribed
# circle still fits inside 61% of 1024:
#
#     588 × 2546.9 / 2400 = 624.0 ≤ 0.61 × 1024 = 624.6
#
# That leaves the mark at 49% of the canvas, which looks small as a file and
# correct on a phone. Sizing it for the square instead is exactly why so many
# sideloaded apps arrive with their logo clipped.
#
# `splash-icon.png` is the launch screen, which is masked by nothing and sits
# alone on the background colour, so the mark can be bigger: 68%. The plugin in
# `app.json` scales it to `imageWidth` dp; this file is the master.
set -eu

SVG=waypoints.svg
SURFACE='#101011'

# Mark 62% of 1024 wide, on the near-black surface.
magick -background none "$SVG" -resize 744x744 \
  -background "$SURFACE" -gravity center -extent 1024x1024 \
  -alpha remove -alpha off PNG24:icon.png

# Mark inside the adaptive mask's guaranteed circle. Transparent: the
# background is a colour in `app.json`, not a layer in this file.
magick -background none "$SVG" -resize 588x588 \
  -background none -gravity center -extent 1024x1024 PNG32:adaptive-icon.png

# Mark 68% of 1024 wide, transparent, for the launch screen.
magick -background none "$SVG" -resize 820x820 \
  -background none -gravity center -extent 1024x1024 PNG32:splash-icon.png
