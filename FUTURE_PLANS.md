# FUTURE_PLANS.md - ZenGM Football (Coach Fork)

Planned / in-progress work items, moved out of `CLAUDE.md` since that file is read every session and this content is only relevant when discussing upcoming or between-season changes.

---

### DB Conversion -- COMPLETE (Phases 1-8 done)

Full plan: `docs/db_conversion.md`

- Phases 1-7: SQLite migration complete, all stores cut over
- Phase 8: Sidecar consolidation complete (coach logic now in `coachDecision.ts`)

### Preseason Exhibition Games -- planned, not started

Full plan: `docs/preseason_exhibition_games.md`

A "Preseason Games" screen under LEAGUE showing three randomly-paired matchups you can sim for fun during the preseason, with the depth chart inverted so buried backups and draft picks play the whole game. Live play-by-play, injuries that evaporate at the whistle, and nothing persisted but the matchups and final scores. Deliberately built to be ripped out in one directory delete if upstream ever ships its own preseason.

Supersedes the earlier league-wide plan in `docs/preseason_games.md`, which is kept for reference but marked do-not-implement -- it was correct but cost far more, concentrated in the files upstream edits most.

### Task 9 -- Upstream Sync (not started)

Record details for future upstream sync approach. See `docs/db_conversion.md` task 9.
Upstream diverges increasingly as we add Electron + SQLite. Manual diff review preferred.

### Injury Tracking Bug -- instant injuries lost, not started

Found 2026-09-04 while investigating LAR's 2001-season defensive injury rate (Daily League). A player hurt on the very first play of a game -- before recording any stat -- never gets an injury record: `game_players` shows `gs=1, min=0.0, injury_type=Healthy, injury_new_this_game` blank/0, even though the play-by-play log clearly shows the injury event.

**Confirmed instance:** Troy Brunson (LB), LAR, 2001 season, playoffs day 21 (Bears @ Rams, gid 280) -- injured on the opening kickoff, first line of the play-by-play. His `game_players` row has zero minutes but reads "Healthy."

**Scope:** checked every LAR defensive player-game this season for the same signature (`gs=1` with near-zero minutes but still "Healthy") -- this was the only occurrence in 19 games. Rare edge case (injury lands before the stat-recording path ever touches that player), not a systemic undercount, but worth fixing since it silently drops a real injury from the record.

**Root cause not yet located** -- likely in `GameSim.football/index.ts`'s injury/stat-recording sequencing (the `injuries()` check vs. whatever writes the box-score row), or in how `game_players` rows get persisted for players who never accrued a stat. Needs a fresh code read before attempting a fix.

### Desperation Mode Tuning -- come back to between seasons, not started

Code changes only happen between seasons, so this is a holding note, not a live task. Origin: mid-draft observation during the 1917 draft (that analysis doc has since been generalized into `docs/draft_guide.md`) that the starting QB throws a disproportionate share of his interceptions late in close games.

**What's confirmed (from that conversation, no fresh code search done here):**

- `probInt` (`GameSim.football/index.ts`, ~line 2323) has no situational/clock/score term at all -- interception odds per throw are constant regardless of game state. The observed pattern is an **exposure effect**, not the QB getting worse under pressure.
- `determineMode()` in `coachDecision.ts` puts the offense into `desperation` when trailing by <=3 pts w/ <3:00 left (or <=7 w/ <5:00, or <=8+ w/ <8:00) in Q4/OT. `playDecision()` in that mode passes on nearly every down (`toGo <= 2` is the only run carve-out) -- so pass volume spikes exactly when trailing late.
- `hurryUp()` in `GameSim.football/index.ts` (~line 620) independently triggers whenever the offense is trailing-or-tied, final period, clock <=2:00 -- and cuts time-per-play from ~40s (`dtClockRunning`) down to `randInt(5,13)/60` (5-13s). That's roughly a 3-6x multiplier on plays-per-minute stacking on top of the pass-heavy desperation call, which is more plays than the module's thresholds were likely tuned assuming.
- `protection` mode (run-heavy, clock-killing) only triggers when _leading_ by >=4 in Q4 w/ <8:00 -- being up by 1-3 late gets no such carve-out and plays out under normal down/distance logic. So the "throws picks when up 2" half of the original observation has no identified mechanism in the coach code -- likely recall bias, not a real effect. Worth re-checking with actual game logs before assuming it's real.

**Open question, not yet a decided direction:** is the pass-heavy desperation call actually miscalibrated, or is it correct real-football strategy (incompletions stop the clock, passing covers ground faster than running) whose INT cost is an accepted tradeoff for extra comeback chances? Dialing it back would likely reduce garbage-time INTs but also reduce comeback win rate -- that tradeoff hasn't been measured.

**Research to do before touching the code:**

1. Pull actual play-by-play/game logs (`logs/worker.log` across several live games, or query `game_scoring_plays`/`player_stats` if enough context is in there) to check whether INTs really cluster in the trailing-and-late window, and whether it's costing wins or just producing dramatic, memorable losses.
2. If real, consider a more surgical fix than broadly dialing back pass rate: e.g. distinguish "still need a full scoring drive" from "already in field-goal range with clock to spare," where a steadier down/distance approach might preserve win probability with less turnover risk, rather than loosening the `toGo <= 2` run carve-out across the board.
3. Re-verify the `hurryUp()`/`determineMode()` thresholds and line numbers above against the code at that time -- this note was written from memory of an earlier read, not a fresh search.

---

### Browser Smoke Test -- incompatible with the SQLite architecture, excluded from `node --run test`

`vitest.config.ts` defines four projects. Three are node (`football`, `basketball`, `baseball`); the fourth, `browser`, runs `src/test/smoke.test.browser.ts` against chromium + firefox + webkit via Playwright. That test creates a league and auto-plays a full basketball season.

**It hangs in this fork and always has.** Measured 2026-09-08 on `master` at `c2bda8a80`, with no local changes in flight:

```
Test Files  3 failed | 3 passed (6)
Tests       3 failed | 33 passed (36)
Duration    615.51s
```

The three "failures" are the same test timing out once per browser, not assertion failures -- `smoke.test.browser.ts` sets `timeout = 10 * 60 * 1000`, and the run lands just past it. The process sits pinned at ~17s CPU for ten minutes: blocked, not computing. The `genPlayoffSeries.ts` / `makeMatchups` stack in the output is just where the sim happened to be when the clock ran out, which vitest says explicitly ("The latest test that might've caused the error is...").

**Why it can't work as architected:** Phases 1-7 moved all league storage to `better-sqlite3` in the Electron **main** process. A headless Playwright browser has no Electron main process, so `league.createStream` -> `autoPlay` stalls on DB calls that can never resolve. We already had to hand-edit this test in Phase 7 (`5e57d0eb3`) to strip its IndexedDB teardown (`idb.meta.close()`, `deleteDB("meta")`); this is the remainder of that same incompatibility, never noticed because nobody ran the browser project.

**What changed:** `package.json` `test` now runs only the three node projects. The browser project is still reachable on demand via `node --run test-browser`.

Cost/benefit of the exclusion: **623s -> 32s** for the default suite, with no loss of real coverage -- the node projects cover 52 files / 333 tests including basketball and baseball, which is what actually guards cross-sport shared code (`common/constants.ts`, `player/skills.ts`, `db/getCopies/playersPlus.ts`).

**To revisit:** the test would need a headless harness that stands in for the Electron main process -- either an in-memory SQLite shim usable from the browser context, or moving the smoke test to a node project that drives the worker directly instead of through a browser. Neither is scoped. Until then `test-browser` is expected to fail and should not gate anything.
