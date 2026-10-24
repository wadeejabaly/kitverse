# Kitverse catalog (draft v1, 2026-09-29)

Built from the supplier's Yupoo catalog (jerseyxie.x.yupoo.com, crawled 2026-09-28/29) plus the
old site's product list (names, Arabic names, images only - **no prices**). Rebuild with
`tools/catalog-build/build_catalog.py <out-dir>`.

## Files
| File | What |
|---|---|
| `teams.json` | 729 teams: EN name, AR name (190 have one), aliases customers type, club/national, league |
| `products.json` | 10,745 shirt products; each groups the supplier's albums into options (audience × version × sleeve) with album IDs |
| `products.csv` | Same, flat, for review in a spreadsheet |
| `featured.csv` | 333 products proposed for the website (curated top clubs + nations, current seasons, H/A/T, + 34 retro icons) |
| `stats.json` | Counts and flag totals |
| `not-offered-summary.json` | Supplier albums left out (training, jackets, shorts, polo, baby, rugby...) |

## Status levels
- **featured** - on the website + bot
- **available** - bot can find and sell it (confirms with the supplier photo), not on the website
- not offered (not in products) - bot hands the request to the owner

## Known gaps (to fix before launch)
- 3,246 "special edition" products and 2,454 with no kit stated: one product per supplier album; names need a photo check. Only matters for items that get asked for / featured.
- 539 teams (mostly small clubs) have no Arabic name yet - the bot translates on the fly; featured teams are all covered.
- Hebrew names not added yet.
- No Liverpool / Juventus current kits at this supplier -> owner availability check via Telegram.
- Supplier sizes per product (e.g. new season only to 2XL) not captured yet - comes from the supplier album pages.
- The old catalog's Rugby "Springbok" shirt was dropped on purpose.
