# FUTURE_PLANS.md - ZenGM Football (Coach Fork)

Planned / in-progress work items, moved out of `CLAUDE.md` since that file is read every session and this content is only relevant when discussing upcoming or between-season changes.

---

## Recommended Order (decided 2026-10-29)

**Follow this order. The items were reviewed and ranked on 2026-10-29, so don't repeat the triage discussion; start at the first item not done.**

**Timing: finish #1-#5 in the Daily League offseason, after the 2002 draft (about to happen as of 2026-10-29) and before the user starts the next season.** Don't start any of it before that draft.

1. **4th Down Near Midfield When Leading.** Outside `protection` mode, `fourthDownDecision()` ignores the score, so a team up 17-0 still goes for it on 4th and 2 at midfield. Proposed fix and its own before/after sims are in the section below. One decision is still open before coding: the lead threshold for the midfield punt -- 9+ as written, or lower so a 4-8 point lead (e.g. up 6) also punts.
2. **Long Field Goals When Leading Late.** Up 2-8 late, the coach tries 55+ yard field goals, misses about half, and hands the opponent the ball near midfield; proposed fix is to require a ~0.65-0.70 make chance in `protection` mode and punt otherwise. Same root cause as #1 (`fourthDownDecision()` ignoring the score), so the two may ship together. They stay separate items because each needs different sims: see each section's before/after check.
3. **Desperation Mode Tuning: research first, implementation optional.** Measure the real cost (do interceptions really cluster in the trailing-late window, and do they cost wins?) before deciding whether to change anything. Unblocked: its "fix pacing first" prerequisite shipped 2026-09-11.
4. **Rushing boost in the run/pass balance -- work on this too.** Too many 3-and-outs, so teams need to run a little more. Once the offense has 5 rushes and 5 dropbacks, `playDecision()` in `coachDecision.ts` sets the run share from effectiveness: `runProb = ypc / (ypc + ypa)`. Proposed: add +0.05 to +0.10 to that run share, capped at 0.90. E.g. 6.0 ypc vs 4.0 ypa is 60/40 today and would become 65/35 to 70/30, depending on the boost we pick. Note: the ratio only decides 1st-down calls; 2nd and 3rd down use the `toGo <= 4` run rule. **Run simulations before making the change** (pick the boost, and measure 3-and-outs, points and drives before/after).
5. **Trade Evaluation API:** a read-only local HTTP API that returns exactly what the engine's trade logic would decide on a hypothetical trade, and why (per-asset values, cap check, team ovr deltas), plus search helpers. Full spec: `TRADE-EVAL-API-SPEC.md` (written by the `zengm-press` assistant, which would call it with `curl`).
6. **Upstream sync:** ongoing, one batch whenever there's room.
7. **Browser smoke test:** skip; low value, needs a stand-in for the Electron database process.

---

### DB Conversion -- COMPLETE (Phases 1-8 done)

Full plan: `docs/db_conversion.md`

- Phases 1-7: SQLite migration complete, all stores cut over
- Phase 8: Sidecar consolidation complete (coach logic now in `coachDecision.ts`)

### Preseason Exhibition Games -- COMPLETE (merged 2026-09-10, `6e21ee6ca`)

Full plan: `docs/preseason_exhibition_games.md`

A "Preseason Games" screen under LEAGUE showing three randomly-paired matchups you can sim for fun during the preseason, with the depth chart inverted so buried backups and draft picks play the whole game. Live play-by-play, injuries that evaporate at the whistle, and nothing persisted but the matchups and final scores. Deliberately built to be ripped out in one directory delete if upstream ever ships its own preseason.

Supersedes the earlier league-wide plan in `docs/preseason_games.md`, which is kept for reference but marked do-not-implement -- it was correct but cost far more, concentrated in the files upstream edits most.

### Task 9 -- Upstream Sync (batch 1 applied 2026-09-08, ongoing)

Process and research checklist: `UPSTREAM_CHANGE_HANDLING.md`. Per-sync record: `docs/upstream_sync_log.md`.
Upstream diverges increasingly as we add Electron + SQLite. Manual per-commit review.

### Clock / Play Pacing -- COMPLETE (shipped 2026-09-11, config K; see `CLAUDE.md` and `docs/clock_play_pacing.md`)

Full findings and the plan: `docs/clock_play_pacing.md` (moved from `zengm-press` 2026-09-10).

Time between plays is bimodal. Across 1,458 plays from 10 late-2001 games the median gap is 7s: 55.9% are under 10s, 39.1% over 40s, and only 5.0% land in the realistic 10-40s band. Runs and completions are fine (41-46s medians); the problem is the third of all plays that never charge any huddle time.

**Leading "new clock" plan (2026-09-10; replaces all earlier candidate fixes):** a new distribution for live-action time per play -- hard floor 4s, max 12s, mean 6s, 10-12s plays a few per game. Two kinds of plays: 97% normal (Gaussian mean 5.8, sd 1, redrawn below 4, capped at 10) and 3% big plays (uniform 10-12s), with the big-play branch driven by the play's result (long gain, return) rather than a random roll. Also lower the out-of-bounds clock-stop rates to real-football levels: runs 15% -> ~6-7%, completions 25% -> ~20%. Dead time after the play depends on how it ended: in bounds ~32s (clipped 24-39s); out of bounds ~24s outside the late windows (last 2:00 of the first half, last 5:00 of the game) and 0s inside them; changes of possession as out of bounds; penalties ~16s (clipped 8-23s); punt/interception touchbacks and fair catches 4-6s of hang time then 0s; incompletions and scores 0s; timeouts 0-2s. One play-length draw per play, capped at 12s, even for compound plays. Hurry-up moves to the same model but gently, verified before/after so comebacks survive. Future considerations: delay of game running off 40s, the 10-second runoff. Details and the per-game table are in the doc's "Leading plan" section.

Closed: the 15%/25% out-of-bounds clock stops on runs and completions fire exactly as coded (measured 14.8% / 25.1%), and the "gets out of bounds 90% of the time on late drives" complaint traced entirely to incompletions, penalties, the two-minute warning and labeled timeouts.

Overlaps Desperation Mode Tuning below: `hurryUp()` feeds both, so the late-game play volume measured there depends on the clock here. Fix pacing first, then measure desperation.

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

### Long Field Goals When Leading Late -- come back to between seasons, not started

Code changes only happen between seasons, so this is a holding note. Origin (2026-10-11): the coach keeps trying 55+ yard field goals when leading by 2-8 late, misses about half of them, and gives the opponent the ball near midfield when a punt would have pinned them deep.

**Current logic (read from the code 2026-10-11):**

- The score only selects the mode (`determineMode()` in `coachDecision.ts`). `fourthDownDecision()` never weighs a long FG against a punt.
- **`protection` mode** (Q4, leading by 4+, under 8:00): `fgOrPunt()` kicks whenever `fgProbability >= FG_MIN_PROBABILITY` (0.40), otherwise punts. So the bar to kick is _lower_ than in normal mode.
- **Normal mode** (includes leading by 1-3 late): `normalDecision()` kicks if `fgProbability > FG_THRESHOLD` (0.45). From 0.40 to 0.45 it goes for it on 4th and 2 or shorter and punts otherwise. Below 0.40 it uses the field-position go/punt table.
- `probMadeFieldGoal()` (`GameSim.football/index.ts`): distance = yards to the goal line + 17 (`FIELD_GOAL_DISTANCE_YARDS_ADDED_FROM_SCRIMMAGE`), then shifted by the leg rating, from -5 yds (kpw 100) to +15 (kpw 0). Base table: 0.47 at 56 yds, 0.43 at 57, 0.39 at 58. Accuracy (`kac`) adds up to +0.10. An average kicker from the opponent's 40 (a 57-yd kick) comes out around 0.43-0.50, so the coach kicks. A strong, accurate kicker clears 0.40 on actual 60+ yd attempts. The same probability decides the real kick, so the misses are what the numbers predict.

**Why it's wrong:** with a 4-8 point lead, a ~45% FG adds little (the lead stays one score either way), and a miss costs ~15-20 yards of field position compared with a punt that probably lands inside the 20.

**Proposed fix:** in `protection` mode (and possibly normal mode in Q4 with any lead), require a much higher make probability, ~0.65-0.70 (about 50 yds for an average kicker), and punt below that. Before/after check: harness `-t "comeback"` and `-t "4th and 2"`, plus a `simFromState` scenario (4th and 8 at the opponent's 38, up 5, 6:00 left in Q4) comparing win% with the current threshold vs the new one.

### 4th Down Near Midfield When Leading -- come back to between seasons, not started

Code changes only happen between seasons, so this is a holding note. Origin (2026-10-21): a team leading 17-0 went for it on 4th and 2 near midfield. A big lead makes the gamble unnecessary: punt and make the opponent drive the length of the field.

**Current logic (read from the code 2026-10-21):**

- Outside `protection` mode, `fourthDownDecision()` ignores the score. `protection` only applies in Q4 under 8:00 when leading by 4+, so a 17-0 lead in Q1-Q3 (or Q4 before 8:00) gets the same call as a tie game.
- `normalDecision()` in `coachDecision.ts` uses a field-position table when out of FG range (`scrimmage` = yards from own goal line): own 40-49 goes on 4th and 1, opponent's 50-45 goes on 4th and 2 or shorter, opponent's 44-31 on 4th and 3, inside the 30 on 4th and 4. 4th and 2 at the opponent's 47 is a go every time.
- In the FG window (`fgProbability` 0.40-0.45) it also goes for it on 4th and 2 or shorter, whatever the score.

**Proposed fix:** when leading by two scores or more (9+), punt instead of going for it near midfield (the `scrimmage` 40-55 rows), in every quarter. The kick-a-field-goal rule is unchanged. Open questions: whether smaller leads (4-8) should also tighten, and whether the 56-69 row (opponent's 44-31, where a punt nets little) should stay a go.

**Before/after check:** a `simFromState` scenario (4th and 2 at the opponent's 47, up 17, Q2 or Q3) comparing win% and points allowed, plus harness `-t "4th and 2"` and `-t "comeback"` to make sure trailing teams' comeback rates don't shift. Related: "Long Field Goals When Leading Late" above -- both come from `fourthDownDecision()` being score-blind outside `protection` mode, so they may be fixed together.

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
