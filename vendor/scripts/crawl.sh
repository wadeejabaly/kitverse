#!/bin/bash
# Crawl jerseyxie.x.yupoo.com category pages -> data/albums.json
# Plain curl works; the 567 anti-bot block only hits naive fetchers without browser headers.
set -euo pipefail
cd "$(dirname "$0")"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"
REF="https://jerseyxie.x.yupoo.com/"
mkdir -p raw

# league -> category id (top-5 + national teams + world cup)
CATS="premier-league:4717652 la-liga:4717651 serie-a:4717649 bundesliga:4717648 ligue-1:4717646 national:4717634 national2:4717636 worldcup:5061877"

for entry in $CATS; do
  NAME="${entry%%:*}"; ID="${entry##*:}"
  PAGE=1
  while :; do
    OUT="raw/${NAME}_p${PAGE}.html"
    curl -s --fail -A "$UA" -H "Referer: $REF" \
      -o "$OUT" "https://jerseyxie.x.yupoo.com/categories/${ID}?page=${PAGE}" || break
    # stop when the page has no album cards
    grep -q 'album__imgwrap' "$OUT" || { rm "$OUT"; break; }
    COUNT=$(grep -c 'album__imgwrap' "$OUT")
    echo "$NAME page $PAGE: $COUNT albums"
    [ "$COUNT" -lt 120 ] && break   # last page
    PAGE=$((PAGE+1))
    sleep 2                          # be polite
  done
done

python3 parse.py
