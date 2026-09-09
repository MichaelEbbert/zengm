# Preseason Games

> **SUPERSEDED 2026-09-09 — do not implement.** Replaced by `docs/preseason_exhibition_games.md`, which reaches the same goal (watch draft picks and buried backups play) at a fraction of the cost and without touching `writePlayerStats` / `writeTeamStats` / `writeGameStats` / `play.ts` / `GameSim.football`.
>
> Nothing below is wrong — every structural claim was re-verified against the tree on 2026-09-09 and still holds. It was dropped on cost: 6 build steps across ~15 files, a SQLite migration, a new league setting, phase-transition rewiring, persistence guards and a GameSim rotation hook, all concentrated in the files upstream edits most. Kept for reference; the research on how "doesn't count" games work and how the depth chart feeds game sim is still the best writeup we have.

## Context

Right now the only way to play a "doesn't count" football game in this fork is the **Exhibition Game** feature (`src/worker/api/exhibitionGame.ts`), which is a fully synthetic, one-off, non-persisted matchup picker — good for a single ad hoc game, but not built for a real week-by-week preseason slate that every team plays through as part of the league calendar.

The goal is a proper **preseason phase**: every team plays a short slate of games that show up in the existing Weekly Schedule view exactly like regular-season weeks, produce real persisted box scores (viewable per-game, including in-game player stat lines), but never touch standings, playoff seeding, head-to-head records, or a player's season/career stat totals. On top of that, preseason games should force a rotation through the full depth chart at every position (so backups get real snaps), without ever writing to the team's actual persisted depth chart — which stays untouched and keeps auto-sorting normally.

This plan is informed by two rounds of research into: (1) how Exhibition games achieve "doesn't count" today, (2) how the depth chart / `GameSim.football` snap-selection mechanism works, and (3) the exact persistence pipeline (`writePlayerStats` / `writeTeamStats` / `writeGameStats`) and where standings, season stats, and box scores are actually written.

**Key discoveries that shape this plan:**

- `Game.playoffs` is never stored on `ScheduleGame`/threaded through `GameResults` — it's derived purely from `g.get("phase") === PHASE.PLAYOFFS` at box-score-write time. `Game.preseason` can be derived the same way (`g.get("phase") === PHASE.PRESEASON`), so **`ScheduleGame` needs no new field at all.**
- Day numbering across phases is already collision-free: `addDaysToSchedule` seeds the starting day from `max(existing day) + 1` for the season, so generating the regular-season schedule after preseason will automatically continue day numbers with zero new code — no ambiguous days in the Weekly Schedule picker.
- The Play-menu/day-loop infrastructure (`game.play(numDays, ...)`) already runs for any phase `<= PHASE.PLAYOFFS`, including `PHASE.PRESEASON` (0). Nothing happens today only because `updatePlayMenu.ts` hard-codes the preseason menu to `["untilRegularSeason"]` and `newPhasePreseason.ts` never populates a schedule — so **no new "Sim Preseason" screen is needed**, just schedule generation + a couple of phase-transition fixes.
- Player/team season-stat rows are keyed only by `(tid, playoffs, season)` / `(playoffs, tid)` — **no phase awareness at all** — and `g.get("season")` is bumped to next year the instant `PHASE.PRESEASON` begins, before any preseason games are played. This means preseason games must **skip** `writePlayerStats`'s accumulation block and `writeTeamStats` entirely (not just add a phase check), or their stats would silently bleed into the following regular season's rows.
- The box score itself (SQLite `games`/`game_teams`/`game_players`/`game_scoring_plays` tables, written via `writeGameToSqlite`) is a fully separate schema from the season-stat stores — safe to write unconditionally for preseason games.
- `GameSim.football` never mutates or persists `Team.depth`/`idb.cache.teams` — it only ever reads an already-converted in-memory `TeamGameSim.depth` array fresh on every play via `updatePlayersOnField`. This means the real depth chart is already 100% safe from any game, and the cleanest rotation seam is a caller-supplied override callback consulted on every play, not a one-time reorder (a one-time reorder would just produce a different permanent lineup, not in-game rotation).

**Decisions confirmed with the user:**

- Box scores (including per-player line stats for that single game) persist and are viewable; those numbers must **not** accumulate into player season/career totals.
- All teams play preseason games (league-wide), not just the user's team.
- Preseason games are **fully isolated from team finances** — no ticket/gate revenue, matching the "isolated like exhibition" model. Revisit later as a follow-up if gate revenue is wanted.
- Preseason game count and whether the feature is enabled at all is a **configurable league setting**, defaulting to **off (0 games)** for existing/upgraded leagues so no current save's behavior changes; new leagues get a small nonzero default.
- The in-game rotation algorithm is defined below (§4): a scripted queue-rotation applied at the start of Q2 and again at the start of Q4, per position, with play-by-play messages announcing each swap.

**Lower-stakes calls made by default (easy to flip later, not architecture-affecting):**

- Tragic deaths are excluded during preseason (same treatment as playoffs) — avoids a jarring narrative event during throwaway games.
- Injury rate/severity uses the same full curve as regular-season games (not reduced like the All-Star Game's `injuryRate / 4`) — preseason injuries to backups are realistic and consequential.

---

## Implementation Plan

### 1. Type / schema changes

- `src/common/types.ts` — `Game` type: add `preseason?: boolean;` alongside the existing `playoffs?: boolean;`. No `ScheduleGame`/`GameResults` changes needed (see Context).
- `electron/sqlite.js` — add a new migration (`"011_preseason_games"`, following the existing numbered-migration pattern in `runMigrations(db)`): `ALTER TABLE games ADD COLUMN preseason INTEGER NOT NULL DEFAULT 0;`. Update `writeGame(db, gameStats)` to write `preseason: gameStats.preseason ? 1 : 0` alongside the existing `playoffs` field.
- `src/worker/db/getCopies/games.ts` — `assembleGames`: map `row.preseason === 1` → `game.preseason = true`, mirroring the existing `playoffs` mapping. This is the single authoritative row→`Game` reconstruction point.
- New game attribute `numGamesPreseason` (default `0` for upgraded leagues, small nonzero default for new leagues) — add to the game-attributes type and to the League Settings form near `numGames`/`allStarGame`.

### 2. Schedule generation & phase transition

- New `src/worker/core/season/newSchedulePreseason.ts`: given active teams' tids, generate `numGamesPreseason` rounds of pairings — shuffle tids each round, pair sequentially, track used pairs to reduce immediate rematches, rotate the bye team if the team count is odd, alternate home/away across rounds. Return `[homeTid, awayTid][]` per round, fed through the existing `addDaysToSchedule` helper so each round becomes one scheduled "day"/week — reusing the same day-assignment machinery the rest of the game already uses.
- `src/worker/core/phase/newPhasePreseason.ts`: after the existing admin bookkeeping (season bump, roster rollover), if `numGamesPreseason > 0`, build the active-teams list the same way `newPhaseRegularSeason.ts` does and call `season.setSchedule(await season.newSchedulePreseason(teams))`. If `numGamesPreseason === 0`, skip schedule creation — phase behaves exactly as it does today.
- `src/worker/core/game/play.ts`:
  - `cbNoGames`: branch `PHASE.PRESEASON` separately from the general `phase < PHASE.PLAYOFFS` case — when the preseason schedule empties, transition to `PHASE.REGULAR_SEASON` (which generates the regular-season schedule as it already does today), not straight to `PHASE.PLAYOFFS`.
  - `cbSaveResults`: exclude `PHASE.PRESEASON` from the `team.updateClinchedPlayoffs(...)` call (meaningless before the regular season has started).
- `src/worker/util/updatePlayMenu.ts`: change the `PHASE.PRESEASON` menu keys from `["untilRegularSeason"]` to include `"day"`/`"week"`/`"month"` (mirroring the regular-season menu) so the user can step through preseason incrementally.
- `src/worker/api/playMenu.ts`: `untilRegularSeason` handler — when in `PHASE.PRESEASON` with a nonempty schedule, simulate through the remaining preseason days (like `untilPlayoffs` does for the regular season) instead of jumping straight to `phase.newPhase(PHASE.REGULAR_SEASON, ...)`; fall back to the current direct transition when the feature is off (empty schedule), preserving the external contract of `/sim/untilRegularSeason`.

### 3. Persistence guarding — skip whole calls, don't scatter phase checks

- `src/worker/core/game/writeTeamStats.ts`: add an early return alongside the existing `allStarGame` shortcut — `if (allStarGame || preseason) return g.get("defaultStadiumCapacity");`. This single change skips standings mutation, `teamStats` season-aggregate accumulation, and all revenue/expense computation and persistence in one shot (this function bundles `teams.put`/`teamSeasons.put`/`teamStats.put` into one unseparated block at the end, so a full skip is the clean option, not a partial guard).
- `src/worker/core/game/writePlayerStats.ts`: broaden the existing `if (!allStarGame) { ... }` accumulation block (the block that does `ps[key] += p.stat[key]`, game logs, max-stat tracking) to `if (!allStarGame && !preseason)`. Leave `checkStatisticalFeat` and `doInjury` unconditional — they're structurally outside/after this block already, so injuries continue to happen and persist for preseason exactly as for real games. During implementation, verify this doesn't leave a stray all-zero season stats row from `addStatsRow`/`statsRowIsCurrent` before a player's first counted regular-season game; suppress that row creation too if so.
- `src/worker/core/game/writeGameStats.ts`:
  - `gameSimToBoxScore`: derive `gameStats.preseason = g.get("phase") === PHASE.PRESEASON` alongside the existing `playoffs` derivation. Exclude preseason from the cosmetic won/lost/tied/otl-increment block (currently guarded by `phase < PHASE.PLAYOFFS`, which is true for preseason too) so preseason box scores don't show a misleading record built from a frozen `teamSeason.won/lost` — leave those fields `undefined` for preseason (already valid per the type).
  - `writeGameStats`: guard the `headToHead.addGame(...)` call with `if (!preseason)` — this is the one real head-to-head persistence side effect in this file.
  - `writeGameToSqlite(gameStats)` stays unconditional — this is the box-score persistence we want to keep.

### 4. Depth-chart rotation algorithm

**Mechanism.** Because `GameSim.football` only ever reads the already-converted, in-memory `TeamGameSim.depth[pos]` array (built once per game by `getDepthPlayers`, never the persisted `Team.depth`), the rotation can be implemented as a **direct in-place mutation of that in-memory array at two fixed points in the game** — the start of Q2 and the start of Q4 — rather than a per-play callback. `GameSim.football` already tracks the current quarter/period internally (used for quarter-by-quarter scoring stats); hook the rotation into that same quarter-advance point (confirm the exact internal counter/transition point in `src/worker/core/GameSim.football/index.ts` during implementation — likely wherever `overtimes`/period increments happen between plays). Gate the whole thing behind a `preseason` flag/option passed into the `GameSim` constructor (mirroring `allStarGame`), so no other game type is affected.

**The move operation.** For a given position `pos` with a configured move count `n`, repeat `n` times:

1. Take the player currently at the front of `depth[pos]` (index 0).
2. Move it to the back of `depth[pos]` (splice from index 0, push to the end).
3. Emit a play-by-play text event (using the same mechanism `GameSim.football` already uses for other injected text events, e.g. injury announcements — identify the exact API during implementation) reading:
   `"Moved {POS} {movedPlayerLastName} down, {newTopPlayerLastName} will play {quarterLabel}"`
   where `{newTopPlayerLastName}` is whoever is now at index 0 _after_ the move (i.e., the player stepping up), and `{quarterLabel}` is `"Q2"` for the first application and `"Q4"` for the second.

Applying the move operation `n` times for a position is a queue rotation by `n`: e.g. for WR (`n=2`) starting from `[WR1, WR2, WR3, ...]`, move 1 produces `[WR2, WR3, ..., WR1]` (message: "Moved WR {WR1} down, {WR2} will play Q2"), then move 2 produces `[WR3, ..., WR1, WR2]` (message: "Moved WR {WR2} down, {WR3} will play Q2") — net effect, both original starters (WR1, WR2) end up at the bottom and WR3 becomes the active starter for the rest of Q2/Q3.

**This runs twice per game, independently, on whatever order currently exists** — the Q4 application does **not** reset to the original Q1 order first; it performs the same move counts again starting from wherever Q2's rotation left the array (so a position keeps cycling forward through its depth chart across the game, e.g. a 3-deep QB room would see QB1 start Q1, QB2 start Q2/Q3, QB3 start Q4).

**QB-specific exception — no wraparound back to the Q1 starter.** For every position _except_ QB, it's fine if a thin position group wraps back around and the original starter ends up playing again in Q4 (e.g. with only 2 CBs, CB2 starts Q2/Q3 and CB1 is back for Q4 — acceptable). QB is the one position where this must **not** happen: before performing the Q4 move for QB, check whether it would put the player who started Q1 back at the front of `depth.QB`; if so, **skip that move entirely** (no reorder, no message) rather than let the original starting QB back in. Concretely, with only 2 rostered QBs: QB1 starts Q1, the Q2 move promotes QB2 (`[QB2, QB1]`, logged normally), and the Q4 move is skipped — QB2 stays in for Q2, Q3, _and_ Q4. With 3+ QBs this exception typically never triggers (the Q4 move lands on a different backup, not the original starter), but the check should still run unconditionally for QB as a safeguard.

**Move counts per position:**

| Position | # moved (per trigger) |
| -------- | --------------------- |
| QB       | 1                     |
| RB       | 1                     |
| WR       | 2                     |
| TE       | 1                     |
| OL       | 3                     |
| DL       | 3                     |
| LB       | 2                     |
| CB       | 2                     |
| S        | 1                     |
| K        | 0 (no change)         |
| P        | 0 (no change)         |

**Edge cases to handle:** if a position group has fewer players than the configured move count (e.g. only 1 CB rostered but the CB count is 2), skip moves that would have no effect (nothing to rotate below 1 player) and don't emit a message for a no-op move. The move operation only reorders the array — it doesn't filter by health/eligibility — the existing per-play `!injured`/fatigue filtering in `updatePlayersOnField` still applies on top of whatever order results, exactly as it does for every other game type today. See the QB-specific exception above for the one case where a would-be wraparound move should be skipped deliberately rather than just for insufficient roster depth.

Wire it up in `play.ts`'s `getResult`: when `g.get("phase") === PHASE.PRESEASON`, pass a `preseason: true` option into the `GameSim` constructor so it performs the Q2/Q4 rotations described above. Every other game path (regular season, playoffs, All-Star, exhibition) omits the flag, so there's zero behavior change elsewhere.

### 5. UI integration

- `src/worker/views/dailySchedule.ts` / `src/ui/views/DailySchedule.tsx`: extend the existing per-day `playoffs` boolean tag mechanism to a `"preseason" | "playoffs" | undefined` tag (checking `game.preseason` for persisted days, `g.get("phase") === PHASE.PRESEASON` for the current live schedule), and extend the day-dropdown label logic (`"${day} (playoffs)"`) to also show `"${day} (preseason)"`. No change needed to conference filtering — preseason games use real team tids on both sides.
- Box score components (`BoxScoreWrapper.tsx`, `BoxScore.football.tsx`, `BoxScoreRow.football.tsx`): add a `preseason` flag sourced from the persisted `Game.preseason` (mirroring the existing `exhibition` cosmetic-flag pattern) to hide won/lost records or show a "Preseason" badge — but keep player-name links active, since unlike exhibition players these are real, linkable players.
- `src/worker/views/playerGameLog.ts`: preseason box scores will automatically show up in a player's game log (it already iterates all persisted games independent of `p.stats`). Add a branch in the W/L/record column logic for `game.preseason` (leaves the record blank, matching `won`/`lost` being `undefined`), and consider a "PRE" tag to distinguish these rows from season-counting games.
- League Settings UI: add the `numGamesPreseason` field near `numGames`/`allStarGame`.
- No changes needed to `src/ui/views/Depth.tsx` — preseason never reads or writes the persisted depth chart beyond the same read-only conversion every game already does.

### 6. Suggested build order

1. Schema plumbing (`Game.preseason`, SQLite migration, `writeGame`/`assembleGames`) — no behavior change, easy to verify in isolation.
2. Persistence guards (`writeTeamStats` early-return, `writePlayerStats` accumulation guard, `writeGameStats`/`gameSimToBoxScore` preseason derivation + `headToHead` guard) — testable by forcing `g.get("phase") = PHASE.PRESEASON` and simming an existing scheduled game before schedule-gen exists, verifying `p.stats`/`teamStats`/`teamSeasons`/`headToHeads` are untouched but a `preseason = 1` box-score row appears and injuries still apply.
3. Schedule generation + phase-transition rewiring (`newSchedulePreseason.ts`, `newPhasePreseason.ts`, `play.ts` branches, play-menu changes) — preseason becomes end-to-end playable via the existing Play menu/HTTP API, using stock (non-rotated) depth-chart behavior.
4. Rotation algorithm (`GameSim.football` constructor `preseason` flag, Q2/Q4 quarter-boundary hook, the per-position move-count table and play-by-play messaging, `play.ts` wiring).
5. UI integration (Weekly Schedule tagging/badges, box score components, player game log, League Settings field).
6. Regression pass: confirm zero behavior change for existing exhibition games, All-Star Game, and normal regular-season/playoff flows; verify no stray empty player-stats rows from step 2.

### Verification

- After step 2: force `g.get("phase")` to `PHASE.PRESEASON` in a test league, sim a manually-inserted schedule game, and confirm via `sqlite3` (per the league DB path in memory) that `games`/`game_players` gained a row with `preseason = 1` while `p.stats`, `teamStats`, `teamSeasons`, and `headToHeads` rows are unchanged from before the sim.
- After step 3: run `SPORT=football node --run dev`, start/advance a league to the preseason phase with `numGamesPreseason` set nonzero in League Settings, and confirm the Play menu offers day/week stepping through preseason, the Weekly Schedule shows preseason weeks, and the phase auto-transitions to `PHASE.REGULAR_SEASON` (generating the normal regular-season schedule) once the preseason slate is exhausted.
- After step 4: sim a preseason game with a full-depth roster and confirm: the play-by-play shows exactly the expected set of "Moved {POS} ... down, ... will play Q2/Q4" messages (right players, right counts per position table), the box score reflects the rotated starters actually getting snaps in Q2/Q3 and again post-Q4-rotation, K/P are never rotated, and `Team.depth` in the DB is byte-for-byte unchanged before/after the game.
- Full pass: `SPORT=football node --run test` to confirm no regression in existing game-sim/exhibition/All-Star test coverage.
