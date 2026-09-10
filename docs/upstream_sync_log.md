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

### Row #16 Hall of Fame backfill — done 2026-09-10

The new HoF thresholds only applied to players evaluated after the merge; every
already-retired player had been judged under the old ones. Ran
`recomputeHallOfFame` via the `POST /debug/eval` passthrough with each league
open in Electron.

**Only one of the four leagues was affected.** Goin Fast League (lid
`1784584722697`, 1920, 5034 retired) went from **230 enshrined to 39** — 203
removed, 12 added. The other three leagues (Daily League, TEST_LEAGUE_1, No Help
Desktop League 5) are all too young for anyone to clear the bar: no changes, and
none had a single HoF player to begin with. TEST_LEAGUE_1's best retired player
scores 94.5 against a 114 threshold.

Every change traces to the new position-specific thresholds, not to any change
in scoring:

| Pos | Threshold (× `hofFactor` 1.2) | Before | After |
| --- | ----------------------------- | ------ | ----- |
| OL  | 180                           | 73     | 3     |
| CB  | 114                           | 58     | 1     |
| LB  | 156                           | 36     | 5     |
| DL  | 168                           | 30     | 4     |
| S   | 96                            | 15     | 0     |
| RB  | 114                           | 11     | 8     |
| WR  | 138                           | 4      | 3     |
| TE  | 72                            | 0      | 5     |
| QB  | 156                           | 3      | 10    |

The sync note predicted defensive backs would be hit hardest; offensive linemen
took the bigger loss, going from the easiest position to enshrine to the
strictest threshold in the game. QB and TE are the only positions that gained.

Verified afterwards: 0 mismatches between stored `hof` and `madeHof()` across
all 5034 retired players, and `hof=1` count on disk is 39, so the write flushed
through rather than sitting in the cache.

**The backfill is per-league by design** — `recomputeHallOfFame` reads
`g.get("lid")` and only touches the open league. A future sync that moves these
thresholds again needs one run per league that has real history.

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

## Sync 1 follow-up — 2026-09-09, the `totTD` crash

**Symptom.** Advancing past the Super Bowl in Test League 1 threw `Critical error during phase change: Missing leader requirements for totTD`, stranding the UI on "Playoffs Processing...". The Super Bowl result was saved; no further day could be advanced.

**Cause.** Row #9 (`9349a6e`) replaced the ad-hoc `minValue` award thresholds with `getLeaderRequirements()`, which throws on any award category it has no entry for (`awards.ts:397`). Football's "League TD Leader" uses `totTD`, and `totTD` had no entry.

**Fix.** `77ffaab74` — one line, `totTD: {}` in the football block of `getLeaderRequirements.ts`. This is upstream's own fix, `1e5472db1` ("Fix", 2026-05-25). The rest of that commit was deliberately skipped: it routes stat loading through a new `getLeaderRequirementsStats` helper we don't have and don't need — none of football's seven award categories carry `minStats`, and every stat they read is already in `awardStats`.

**Why the sync missed it.** `1e5472db1` sits inside batch 1's commit range, but touches only `TODO`, `awards.ts`, `getLeaderRequirements.ts` and `views/leaders.ts`. No path contains "football", so `git log -- '*football*' '*Football*'` — the command the entire research log is built on — never surfaced it. This is a structural hole in the method, not a one-off; see checklist item 12 in `UPSTREAM_CHANGE_HANDLING.md`.

**Regression guard.** `doAwards.football.test.ts` asserts every league-leader award category has a `getLeaderRequirements` entry. The `categories` array in `doAwards.football.ts` was hoisted to module scope and exported as `leagueLeaderCategories` to make it reachable. Verified by deleting the `totTD` entry and confirming the test fails naming the stat. Football only — basketball and baseball have vitest projects but their `doAwards` paths never run in this fork, and each hoist adds conflict surface in a file upstream actively edits; hockey has no vitest project at all.

The sibling throw at `getSeasonLeaders.ts:146` needs no guard. It iterates `PLAYER_STATS_TABLES` via `getPlayerProfileStats()`, predates row #9, and has been exercised by 26 seasons of play. `totTD` is not in those tables, which is exactly why only the awards path broke.

### Follow-up sweep of the applied rows

Ran the item-12 sweep retroactively over the seven behavior-changing merged rows (`git log <row-sha>..4ee432c5b -- <files that row touched>`, minus the 45 SHAs already classified):

- **Rows #17 (`d416f92`), #21/#22 (`19539ff`/`a3ffb36`): zero unclassified follow-ups.** Complete as applied.
- **Row #9 has a five-commit follow-up chain**, 2026-05-25→27, all in `src/worker/views/leaders.ts`:

| SHA         | Subject                                           | Effect                                                    |
| ----------- | ------------------------------------------------- | --------------------------------------------------------- |
| `c4c0dcfdf` | Logging                                           | `throw` on a missing minStat value → bugsnag + `continue` |
| `da7579622` | It is expected that some stat values are missing  | drops the bugsnag, also catches `NaN`                     |
| `0e69c08e5` | Fix                                               | skip career rows with `min === 0`                         |
| `21e0c67b5` | Skip players with no stats row for a given season | `iterateAllPlayers` → `iterateAllPlayersWithStats`        |
| `22e31e709` | Fix                                               | `showNoStats: true` for deleted teamStats rows            |

**Deferred, not merged.** The chain cannot reproduce the football awards crash: all seven football award categories have no `minStats`, so `playerMeetsCategoryRequirements` short-circuits at `let pass = !cat.minStats && ...` before reaching any of this code. Our tree also predates `c4c0dcfdf`, so we never had the `throw` those commits walk back — a missing value currently just fails the comparison silently. The chain only affects the Leaders page. Recorded here so the next sync doesn't rediscover it from scratch.

### Not yet done

- Sim a season in Electron to confirm drive stats and punt distances behave as expected.

Merging `upstream-sync-2001` into `master` is done — `53160803f`, pushed 2026-09-08.
