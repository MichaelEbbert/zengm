# FUTURE_PLANS.md - ZenGM Football (Coach Fork)

Planned / in-progress work items, moved out of `CLAUDE.md` since that file is read every session and this content is only relevant when discussing upcoming or between-season changes.

---

### DB Conversion -- COMPLETE (Phases 1-8 done)

Full plan: `docs/db_conversion.md`

- Phases 1-7: SQLite migration complete, all stores cut over
- Phase 8: Sidecar consolidation complete (coach logic now in `coachDecision.ts`)

### Preseason Games -- planned, not started

Full plan: `docs/preseason_games.md`

League-wide preseason games that appear in the Weekly Schedule, persist viewable box scores, but don't affect standings/player season stats/head-to-head, plus a depth-chart rotation seam in `GameSim.football` so backups get snaps without touching the persisted depth chart.

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
