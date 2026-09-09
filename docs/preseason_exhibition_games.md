# Preseason Exhibition Games

**Status: planned, not started.** Supersedes `docs/preseason_games.md` (2026-09-09).

## Context

The goal is realism and fun, not simulation impact: during the preseason, click a few throwaway games and watch the draft picks and buried backups actually play. Nothing about the league changes as a result.

That goal is real. Snap distribution in the Goin Fast league after 5 games shows fatigue rotation reaching about two deep and then falling off a cliff:

| Position | Distribution                                   | Third-stringer's share |
| -------- | ---------------------------------------------- | ---------------------- |
| RB       | 78 / 30 / 1 carries                            | 0.9%                   |
| TE       | 15 / 10 / 2 catches                            | 7.4%                   |
| DL       | 9 / 3 / 12 / 3 / 1 / 1 / 0 / 0 / 0 / 0 tackles | DL5-10 got 2 of 29     |

(DL tackles are a noisy proxy for snaps — DL3 outscoring DL1 shows role matters — but four players recording zero is unambiguous.)

So backups below the second string never see the field. A preseason feature has something to show you.

**Why the original plan was dropped.** `docs/preseason_games.md` was well-researched, and every structural claim in it still verified against the current tree. It was abandoned on cost, not correctness: 6 build steps across ~15 files, a SQLite migration, a new league setting, phase-transition rewiring, persistence guards threaded through `writePlayerStats` / `writeTeamStats` / `writeGameStats`, and a rotation hook inside `GameSim.football`. Every one of those last four files is among the ones upstream edits most — the 2001 sync paid four separate hand-merge taxes in exactly that neighborhood. That is a lot of permanent maintenance surface for a feature with zero simulation impact.

This plan reaches the same goal by inverting the depth chart in a throwaway exhibition game, and touches none of those files.

## Findings that make this cheap

Verified against the tree on 2026-09-09:

1. **`GameSim` cannot corrupt live players.** `processTeam` (`loadTeams.ts:210`) builds a fresh object per player — `injury: {...p.injury}` is a spread copy, `injured` a derived boolean. GameSim only ever mutates that copy (`GameSim.football/index.ts:3088`). Injuries reach the database solely through `writePlayerStats`'s `doInjury`, which this feature never calls. **Preseason injuries get announced in the play-by-play and evaporate at the final whistle, for free.**
2. **The live game viewer is a replayer, not a writer.** The sim runs to completion first; the finished play-by-play is then handed to the UI. In `play.ts:336-349` persistence has already happened before `toUI("realtimeUpdate", ..., ["live_game"])` fires. `gameSimToBoxScore` is read-only (one `idb.cache.allStars.get`). Exhibition proves the separation — same `boxScoreToLiveSim`, zero persistence.
3. **Depth arrays contain the entire roster, not just position players.** `genDepth.football.ts:107` does `depth[pos] = players.map(p => p.pid)` for every position, sorted by `ovrs[pos]` with a +15 bonus for natural position; `getDepthPlayers.ts:44-51` confirms it from the other side by appending every unlisted player. **A naive full reversal would start a kicker at defensive tackle.**
4. **`electron/sqlite.js` is 100% ours.** Upstream has no idea it exists. New tables there are the lowest-conflict change available in this codebase. Latest migration is `010_custom_game_stats`.
5. **Do not call `simExhibitionGame` from inside an open league.** It fakes a league context because it normally runs outside one: `phase`, `userTid` to 0, `userTids` to `[0,1]`, all **72** keys of `EXHIBITION_GAME_SETTINGS`, `budget`/`spectator`/`otl`/`elamASG`, plus `season` to 0 and `numActiveTeams` to 2 in `getSeasonInfo`, plus populating `local.exhibitionGamePlayers` — which is consulted in three places in `api/index.ts` and branched on at `genDepth.football.ts:43`. None of it persists, but the worker's in-memory `g` drives everything until reload.

   Calling `GameSim` directly is **less** code, not more: `processTeam` and `getDepthPlayers` are already exported, and inside a real league `g` is already correct.

## Design constraint: easy to rip out

Upstream may ship its own preseason someday. Removal should be a directory delete, not archaeology.

- All real logic lives in new files under one prefix. Nothing in `GameSim.football/index.ts`, `play.ts`, or any `write*.ts` — which is precisely what calling `GameSim` directly buys.
- Touch points in upstream-owned files stay countable and one line each: `menuItems.tsx`, `routeInfos.ts`, `ui/views/index.ts`, `worker/views/index.ts`.
- The depth inversion is a pure function: depth object in, new depth object out. No caller inside the game engine.
- Removal = delete the module directory, revert four one-line registrations, drop the table. The migration stays (they are append-only), but an unused table is inert.

If upstream does ship preseason, this likely survives anyway — theirs would be a scheduled slate that counts nothing; this is a backups-first exhibition. Different features.

## Implementation

### 1. Storage (`electron/sqlite.js`)

New migration `011_preseason_matchups`:

```sql
CREATE TABLE preseason_matchups (
    season     INTEGER NOT NULL,
    week       INTEGER NOT NULL,
    home_tid   INTEGER NOT NULL,
    away_tid   INTEGER NOT NULL,
    home_pts   INTEGER,
    away_pts   INTEGER,
    PRIMARY KEY (season, week)
);
```

Three rows per season, `week` 1-3 — one per column on the screen.

Scores are `NULL` until played, and a non-null score is what disables that matchup's Watch button. Box scores are deliberately **not** stored; add later if it proves useful.

Rows are keyed by season, so next preseason generates fresh matchups naturally and old rows are harmless.

### 2. Transport

The worker reaches SQLite over HTTP at `127.0.0.1:3001` (`src/worker/db/electronApi.ts`), dispatched by the route table in `electron/main.js:137`. Add:

- `GET /preseason/matchups?lid&season` — read
- `POST /preseason/matchups` — upsert (generate)
- `POST /preseason/score` — record a final score

with matching helpers in `electronApi.ts`, following the existing `readAllTeams` / `flushTeams` shape.

### 3. Depth inversion (pure function, new file)

For each position, reverse **only the players whose natural position is that position**, permuting them among the slots they already occupy. Every other slot keeps the player it had. With ten DL at the top of the list, the field becomes DL10, DL9, DL8, DL7, and no kicker lines up at tackle.

Permuting in place, rather than reversing a leading run, is deliberate: natural-position players are **not** guaranteed to be contiguous at the top. `genDepth` sorts by `ovrs[pos]` plus a +15 natural-position bonus, so a well-rated out-of-position player can outrank a weak natural one, and the user can reorder the chart by hand besides. Because non-natural players never move, "no out-of-position player is ever promoted" is a structural invariant rather than a hoped-for outcome — and it is directly assertable in a test.

Take `Team["depth"]` (a plain `{QB: pid[], ...}` object) plus enough player info to read `ratings.pos`, and return a new object. Never mutates its input, never touches the persisted depth chart.

K and P are single-deep by design — skip them.

### 4. Worker module (new file)

- **Generate matchups**: see the pairing rules below. Called on first visit during preseason, then never again for that season.
- **Sim one matchup**: load both teams' players from cache, then `processTeam` -> invert depth -> `getDepthPlayers` -> `new GameSim({...})` -> `gameSimToBoxScore` -> `boxScoreToLiveSim` -> hand to the UI, then write only the final score back to `preseason_matchups`.

Mirror exhibition's `{liveSim}` handoff shape rather than the league route's `{gidOneGame, playByPlay}` — there is no real gid, because no game row is ever written.

### 4a. Pairing rules

**Week 3 is the Super Bowl rematch.** Last season's two finalists play each other. Derive them from last season's `teamSeasons`: the champion is `playoffRoundsWon === numGamesPlayoffSeries.length` (the same test `views/history.ts:145` uses), and the runner-up is `playoffRoundsWon === length - 1`, which is unique — every other team eliminated in the semifinals won two fewer rounds.

Guard every one of these, falling back to a random pair for week 3:

- `season === startingSeason` — no previous season exists at all
- last season has no `teamSeasons` rows, or playoffs were never played
- either finalist is not found, or the two resolve to the same tid
- a finalist team has since been disabled or contracted

**Weeks 1 and 2 are purely random** — any team may draw any other, with no regard to conference, division or record.

**One constraint across all three weeks: no pair repeats.** A team may appear in more than one matchup, but never against the same opponent twice. Generate week 3 first (so the rematch is guaranteed), then draw weeks 1 and 2 rejecting any pair already used.

Worth expecting on screen: with 3 pairs drawn from ~32 teams, there is roughly a 1-in-3 chance some team turns up in two of the three matchups. That is allowed by the rule as stated — it is not a bug.

### 5. UI (new view plus four registrations)

- **View**: three columns, one per matchup (weeks 1-3), each with team names and a Watch button. Once a score is stored, the column shows the final score and **the Watch button is disabled** — each matchup is watchable exactly once, so no stored score is ever overwritten. Week 3 is labelled as the Super Bowl rematch when it actually is one.
- **Menu**: `menuItems.tsx`, directly beneath Notes (`:278`) in the `League` header. Always visible — there is no phase-conditional flag on `MenuItemLink` (only `league` / `nonLeague` / `godMode`), and adding one is unnecessary. Outside the preseason the page shows an error, matching the Trade page's after-the-deadline behavior (`ui/views/Trade/index.tsx:517`).
- **Route**: `/l/:lid/preseason_games` in `routeInfos.ts`, plus exports in `ui/views/index.ts` and `worker/views/index.ts`.

## Decisions

- Three matchups, one per preseason week.
- Weeks 1-2 random; week 3 is last season's Super Bowl rematch, with fallbacks.
- No pair repeats across the three weeks; a team may appear twice.
- Watch is disabled once a score is stored — one watch per matchup, no overwrites.

## Testing

Vitest is this project's JUnit. `test("name", () => {...})` is `@Test`, `assert`/`expect` are the assertions. The big difference: there are no classes to instantiate — everything worth testing here is a plain exported function, so it is closer to unit-testing a Java static utility than a service object. No mocking framework is needed for either test below.

Tests live beside the source they cover. The `.football.test.ts` suffix routes a file to the `football` vitest project (`vitest.config.ts`); a plain `.test.ts` would land in the basketball project instead, so **the suffix is required**, not decorative.

**Two of the five pieces are genuinely unit-testable — and they are the two with actual logic.**

### Depth inversion — `<module>/invertDepth.football.test.ts`

The ideal unit test: a pure function, no DB, no `g`, no async. Model it on `src/worker/core/team/getDepthPlayers.football.test.ts`, which builds a literal depth object and asserts on the output.

Cases worth covering:

- **The core case.** 10 DL followed by an out-of-position tail; assert the first four become DL10, DL9, DL8, DL7 and the tail is byte-identical.
- **The bug this function exists to prevent.** Assert no player whose natural position differs ever moves into the top N. This is the kicker-at-defensive-tackle regression.
- **Thin position groups.** One player, and zero players, at a position — must not throw.
- **K and P are untouched.**
- **Input is not mutated.** Deep-equal the input object against a pre-call copy.

### Matchup generation — `<module>/genMatchups.football.test.ts`

Also pure, given a list of tids and last season's standings passed in as arguments rather than read from the DB. **Design the function that way specifically so it can be tested** — take `{tids, champTid, runnerUpTid}` and return three pairs. All the DB reading lives in the caller.

Model it on `src/worker/core/season/newScheduleGood.football.test.ts`, which tests schedule generation the same way.

Cases:

- Exactly three pairs, weeks 1-3.
- Week 3 is the champ/runner-up pair when both are supplied.
- Week 3 falls back to a random pair when either is `undefined`, when they are equal, or when either is missing from `tids`.
- **No pair repeats** across the three weeks — run it many times (say 500) with a small team count to force collisions, and assert the invariant holds every time. This is the constraint most likely to break under an unlucky draw, and the one a manual pass would almost never surface.
- A team appearing in two matchups is accepted, not rejected.

### What cannot be unit-tested

The SQLite layer (it lives in the Electron main process behind an HTTP API), the view, and the live-sim handoff. Those are the plumbing, and they are what TEST_LEAGUE_1 is for — the same way it surfaced the `totTD` phase-change defect that no test caught.

## Manual verification (TEST_LEAGUE_1)

- Sim a matchup and confirm via `sqlite3` that only `preseason_matchups` changed: no new `games` / `game_players` rows, and `players`, `team_stats`, `team_seasons` untouched.
- Confirm an injury announced in the preseason play-by-play does **not** appear on the player afterward.
- Confirm `teams.depth` in the DB is byte-for-byte identical before and after.
- Confirm the live sim renders and the play-by-play names the expected inverted starters — DL10 through DL7 on the field, not a kicker.
- Confirm nothing about the live league changed: still your `userTid`, still preseason phase, quarter length unchanged. This is the regression that catches an accidental `simExhibitionGame` call.
- Open the page outside the preseason and confirm the error message rather than a crash.
- `SPORT=football node --run test > <file> 2>&1` — no existing test should move.
