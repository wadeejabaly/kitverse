#!/bin/bash
# Download album photos and produce white-backdrop product images.
# usage: ./process.sh <hash> [hash...]     (photo hashes from photo.yupoo.com/jerseyxie/<hash>/big.jpg)
# Requires: imagemagick (brew install imagemagick), bin/lift (compiled from bin/lift.swift, macOS 14+)
#
# Pipeline per image:
#   big.jpg (1080x1080, largest size the CDN serves; original/large are identical and smaller)
#   -> Vision subject lift (bin/lift)  — garment pixels untouched
#   -> trim to subject, Lanczos resize to 85% of frame
#   -> composite on white, pad to 2048x2048
#
# KNOWN LIMIT: shots of jerseys on the black mannequin/rack lift the mannequin too.
# Prefer flat-lay photos. Covers lie (see crawl/parse.py) — pick per-album source photos.
set -euo pipefail
cd "$(dirname "$0")"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36"
REF="https://jerseyxie.x.yupoo.com/"
mkdir -p src out/white

for H in "$@"; do
  [ -f "src/$H.jpg" ] || curl -s -H "Referer: $REF" -A "$UA" \
    -o "src/$H.jpg" "https://photo.yupoo.com/jerseyxie/$H/big.jpg"
  if [ "$(wc -c < "src/$H.jpg")" -lt 5000 ]; then echo "$H: download failed"; rm -f "src/$H.jpg"; continue; fi
  ./bin/lift "src/$H.jpg" "out/$H.cut.png" >/dev/null 2>&1 || { echo "$H: no subject found"; continue; }
  magick "out/$H.cut.png" -trim +repage -filter Lanczos -resize 1740x1740 \
    -background white -alpha remove -alpha off -gravity center -extent 2048x2048 \
    -quality 90 "out/white/$H.jpg"
  rm "out/$H.cut.png"
  echo "$H: ok -> out/white/$H.jpg"
done
