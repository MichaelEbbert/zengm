#!/usr/bin/env bash
# Full RB pipeline (overnight run 2026-10-14):
#   bash runRb.sh <class dir>
# e.g. a scratch copy for a dry run, or ../../../draft_classes for the real
# write (only with the user's go-ahead). Sizes -> 8 stat ratings -> seeded ->
# ovr fit -> ovr/pot. Run `npx oxfmt <class dir>` afterwards for the real files.
set -e
cd "$(dirname "$0")"
export REAL_DRAFT_CLASSES="$(cd "$1" && pwd)"
node rateRb.cjs --write-size
for r in spd elu stre bsc hnd rtr endu hgt; do node rateRb.cjs --rating "$r" --write | head -1; done
node seedRb.cjs --write
cd ../../..
REAL_DRAFT=1 REAL_DRAFT_WRITE=1 REAL_DRAFT_POS=RB SPORT=football npx vitest run --project football docs/real_draft_classes/scripts/fitOvr.football.test.ts 2>&1 | grep -E "Tests |Error" || true
REAL_DRAFT=1 REAL_DRAFT_WRITE=1 REAL_DRAFT_POS=RB SPORT=football npx vitest run --project football docs/real_draft_classes/scripts/ovrPot.football.test.ts 2>&1 | grep -E "RB:|Tests |Error" || true
