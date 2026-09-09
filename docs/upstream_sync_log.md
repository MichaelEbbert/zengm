---
title: Upstream Sync Log
purpose: Merge-tracking record of upstream commits actually applied to this fork
---

# Upstream Sync Log

Companion to `UPSTREAM_CHANGE_HANDLING.md`. That file is the **research log** — it decides MERGE or DECLINE. This file is the **merge log** — it records what was actually applied, when, and how. Referenced by `docs/db_conversion.md` Task 9 / Phase 9.

Upstream merges happen **between seasons only**.

## Sync 1 — 2026-09-08, after the 2001 season

Branch `upstream-sync-2001`, one commit per research-log row. Rollback point: tag `end-2001-daily-league-season` (`c2bda8a80`).

Applied against `upstream/master` at `9e0de55c615e301512862bb188cc0f6e77bb6a1e`, from the 22 batch-1 rows researched 2026-08-24. All 17 MERGE rows applied; the 5 batch-1 DECLINE rows (#5, #6, #7, #8, #19) and all 21 batch-2 rows (#23-#43) were not.

| Row | Upstream SHA | Category | Subject                                            | Status                         |
| --- | ------------ | -------- | -------------------------------------------------- | ------------------------------ |
| #4  | `e71a11e`    | A        | NOT_REAL_POSITIONS array->Set (all 10 files)       | applied                        |
| #1  | `f4a4ab4`    | A        | fix team ovr weight array ordering                 | applied                        |
| #2  | `6bad93f`    | A        | BoxScore.won type — **football hunk only**         | applied, partial               |
| #15 | `db87bd4`    | A        | Object.entries/values loops                        | applied                        |
| #20 | `d5241be`    | A        | BoxScoreRow onClick type — **incidental fix only** | applied, partial               |
| #10 | `72fb496`    | A        | careerStats implies keepWithNoStats                | applied                        |
| #11 | `373cbcf`    | A        | revert row.playoffs cast (pairs with #10)          | applied                        |
| #3  | `3e3d44b`    | A        | All-League from its own offensive pool             | applied                        |
| #9  | `9349a6e`    | C        | unify league leader award requirements             | applied, hand-merged           |
| #16 | `19ac42e`    | A        | rebalance FBGM HoF position thresholds             | applied — **backfill pending** |
| #12 | `aa9d406`    | A        | extract ratingsGradientStyle helper                | applied                        |
| #13 | `b5494985`   | A        | color-code ratings on player profile               | applied                        |
| #14 | `3f79fe5`    | C        | move FATIGUE_POS to constants.football.ts          | applied, hand-merged           |
| #17 | `d416f92`    | C        | fix drive tracking                                 | applied                        |
| #21 | `19539ff`    | C        | split punting composite                            | applied, hand-merged           |
| #22 | `a3ffb36`    | C        | punting power vs accuracy                          | applied, hand-merged           |
| #18 | `dcb2884`    | C        | show career stat for retired players               | applied, hand-merged           |

### Outstanding action

**Row #16 requires a backfill that has not been run.** The new HoF thresholds only apply to players evaluated after this point; every already-retired player in the league was judged under the old ones. Run `recomputeHallOfFame` from the debug tools with the league open in Electron. Expect currently-enshrined players — especially defensive backs, who needed a score of 40 against the new 95 — to be removed.

### Hand-merge notes

Four recurring frictions, all traceable to batch-1 rows we declined. These are **semantic, not textual** — every patch applied cleanly via 3-way and then failed to compile.

1. **`random.` namespace tax (declining #7).** Upstream moved `random.*` to named imports; we didn't. Bare `truncGauss` / `randInt` in new GameSim code must be rewritten to `random.truncGauss` / `random.randInt`. Hit rows #14, #21, #22.
2. **Default-vs-named export tax (declining #8).** Any patch whose _context lines_ are import statements mismatches. Hit row #9 (`defaultGameAttributes`, which we get from the util barrel, and which became unused) and row #18 (`processPlayersHallOfFame`, still a default export here).
3. **`userTid` prop vs. hook (declining #5).** Upstream moved `userTid` off route props onto `useLocalPartial`. All four `History.<sport>/index.tsx` views conflict on the destructure; resolution is to keep `userTid` and add upstream's new field. Hit row #18.
4. **`toUI` import.** Ours, not upstream's, and it sits on the same `GameSim.football/index.ts` line 1 that upstream keeps editing. Hit row #14.

Expect all four again on the next sync.

### Verification

- Typecheck gated per row by diffing `tsc --build` error _keys_ (`file(line,col): error TSxxxx`) against a pre-merge baseline of 65 pre-existing errors. Raw message text is unusable for this — tsc emits union members in nondeterministic order. Every row finished at exactly 65, no new errors.
- Tests gated per group with `node --run test` (~32s). Final: **52 files / 335 passed, 12 skipped, 0 failed** — up from 333 pre-merge, the +2 being new regression tests from rows #10 and #17.
- The browser smoke-test project is excluded from `node --run test` and is expected to fail; see `FUTURE_PLANS.md`. It is unrelated to this sync — verified failing identically on `master` before any of it was applied.

### Not yet done

- Merge `upstream-sync-2001` into `master` and push.
- Run the row #16 HoF backfill.
- Sim a season in Electron to confirm drive stats and punt distances behave as expected.
