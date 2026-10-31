#!/usr/bin/env bash
# Full WR pipeline: bash runWr.sh <class dir>
# e.g. a scratch copy for a dry run, or ../../../draft_classes for the real
# write. Position moves -> sizes -> 8 stat ratings -> seeded -> ovr fit ->
# ovr/pot. Run `npx oxfmt <class dir>` afterwards for the real files.
# After the fit, file ratings no longer equal rateWr's output, so rerun the
# whole pipeline after any change, not one rating.
set -e
cd "$(dirname "$0")"
export REAL_DRAFT_CLASSES="$(cd "$1" && pwd)"
node moveToWr.cjs
node rateWr.cjs --write-size
for r in hnd rtr hgt bsc spd elu stre endu; do node rateWr.cjs --rating "$r" --write | head -1; done
node seedWr.cjs --write
cd ../../..
REAL_DRAFT=1 REAL_DRAFT_WRITE=1 REAL_DRAFT_POS=WR SPORT=football npx vitest run --project football docs/real_draft_classes/scripts/fitOvr.football.test.ts 2>&1 | grep -E "Tests |Error" || true
REAL_DRAFT=1 REAL_DRAFT_WRITE=1 REAL_DRAFT_POS=WR SPORT=football npx vitest run --project football docs/real_draft_classes/scripts/ovrPot.football.test.ts 2>&1 | grep -E "WR:|Tests |Error" || true
