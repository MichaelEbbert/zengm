# ZenGM DB Conversion

## Goal

Convert the live running ZenGM system to use SQLite as its primary data store — not an export or mirror. Every atomic action that creates or modifies data must write to SQLite immediately, in real time.

Read-only data that was fetched but not modified may be kept in browser session memory as a cache. But any write — new record, update, delete — hits SQLite first.

## Motivation

- Browser IndexedDB/JSON is opaque, hard to query, and inaccessible from outside the browser
- SQLite is the ground truth: persistent, portable, queryable, and accessible to the LLM coach agent sidecar directly
- Coach agent can read and write game state without going through the browser at all
- Enables full observability and replay of game events outside the browser context

## Project Location

`/home/michael/claude_projects/zengm/`

## Status

- [ ] Research phase — no code changes

## Research Tasks

### 1. Storage Layer Recon — COMPLETE

There is a clean, centralized abstraction. IndexedDB is NOT scattered throughout the codebase.

**Three-layer architecture (`src/worker/db/`):**

| Layer           | Object       | File               | Role                                           |
| --------------- | ------------ | ------------------ | ---------------------------------------------- |
| In-memory cache | `idb.cache`  | `Cache.ts`         | All active game reads/writes go here first     |
| League DB       | `idb.league` | `connectLeague.ts` | Raw `IDBPDatabase` — the persistence layer     |
| Meta DB         | `idb.meta`   | `connectMeta.ts`   | `SafeIdb` wrapper — stores the list of leagues |

**How writes actually work:**

1. All game data writes go through `idb.cache._put()` / `._add()` / `._delete()`
2. These mark records dirty in `_dirtyRecords` and set `_dirty = true`
3. Every **4 seconds**, `_autoFlush()` batches all dirty records and writes them to IndexedDB via `flush()`
4. `flush()` is also called explicitly at phase transitions and game saves

**The single replacement point:**

- `Cache.flush()` in `Cache.ts` is where all dirty records hit IndexedDB
- `Cache.fill()` is where data is loaded from IndexedDB into memory on league open
- Replacing these two methods (and `idb.meta` calls) covers the entire persistence layer

**22 stores (data model) already defined in `Cache.ts`:**
`allStars, awards, draftLotteryResults, draftPicks, events, gameAttributes, games, headToHeads, messages, negotiations, playerFeats, players, playoffSeries, releasedPlayers, savedTrades, savedTradingBlock, schedule, scheduledEvents, seasonLeaders, teamSeasons, teamStats, teams, trade`

**Key implication:** The cache layer is already doing exactly what we want — all reads served from in-memory cache, writes batched to persistent storage. We only need to swap the persistent backend from IndexedDB to SQLite. The cache stays untouched.

### 2. File Count Baseline — COMPLETE

| Metric                                   | Count     |
| ---------------------------------------- | --------- |
| Total source files (.ts/.tsx)            | 1,081     |
| Files touching data (any idb access)     | 242 (22%) |
| Via `idb.cache` (normal path)            | 220       |
| Via `idb.league` directly (bypass cache) | 28        |
| Via `idb.meta` (league management)       | 25        |

**idb.cache files by area:**

| Area         | Files |
| ------------ | ----- |
| worker/core  | 129   |
| worker/views | 49    |
| worker/util  | 20    |
| worker/db    | 18    |
| worker/api   | 3     |
| test         | 1     |

**idb.league direct-access files (28 — these bypass the cache and hit IDB directly):**
These are the "escape hatch" — used for historical/cross-season queries not held in cache:

- `db/getCopies/` and `db/getCopy/` — bulk historical reads (events, games, players, awards, etc.)
- `views/` — frivolitiesTrades, frivolitiesTeamSeasons, gmHistory, colleges, leaders
- `util/` — achievements, getProcessedGames
- `core/league/` — close, createStream
- `core/phase/newPhaseRegularSeason`, `core/season/getSeasonLeaders`, several debug utilities
- `api/index.ts`

**Key implication:** The 28 `idb.league` direct files are a second replacement surface beyond `Cache.flush()`/`fill()`. They read historical data that isn't loaded into the cache. For the conversion, these need to query SQLite directly instead.

### 3. Data Model Inventory — COMPLETE

22 stores. Schema defined in `src/worker/db/connectLeague.ts`, cache behavior in `Cache.ts`.

**Per-season frequency note:** Cache loads only current-season data for most stores. Historical data (prior seasons) stays in IndexedDB only and is queried directly via `idb.league` (the 28 direct-access files from task 2).

| Store                 | PK            | Notes                                                                                                   | Est. rows (active) | Est. rows (10-season league) |
| --------------------- | ------------- | ------------------------------------------------------------------------------------------------------- | ------------------ | ---------------------------- |
| `allStars`            | season        | 1 row/season                                                                                            | 1                  | 10                           |
| `awards`              | season        | 1 row/season                                                                                            | 1                  | 10                           |
| `draftLotteryResults` | season        | 1 row/season                                                                                            | 1                  | 10                           |
| `draftPicks`          | dpid (auto)   | Future picks owned by teams                                                                             | ~500               | ~500 (rolling)               |
| `events`              | eid (auto)    | News log — many per season                                                                              | ~500/season        | ~5,000+                      |
| `gameAttributes`      | key (string)  | League settings, ~100 key/value pairs                                                                   | ~100               | ~100 (constant)              |
| `games`               | gid           | Box scores; player stats embedded per game                                                              | 272 (NFL/season)   | ~2,700                       |
| `headToHeads`         | season        | 1 row/season                                                                                            | 1                  | 10                           |
| `messages`            | mid (auto)    | Owner messages                                                                                          | ~20–50             | ~300                         |
| `negotiations`        | pid           | Active contract talks — transient                                                                       | <10                | <10 (rolling)                |
| `playerFeats`         | fid (auto)    | Statistical feats (big games)                                                                           | ~50/season         | ~500                         |
| `players`             | pid (auto)    | **Largest store.** Career stats embedded as array inside each player row. Cache loads non-retired only. | ~2,000 active      | ~5,000+ total                |
| `playoffSeries`       | season        | 1 row/season                                                                                            | 1                  | 10                           |
| `releasedPlayers`     | rid (auto)    | Released players still owed money                                                                       | ~30                | ~30 (rolling)                |
| `savedTrades`         | hash (string) | User-saved trade proposals                                                                              | <10                | <10                          |
| `savedTradingBlock`   | 0 (singleton) | Single row always                                                                                       | 1                  | 1                            |
| `schedule`            | gid (auto)    | Upcoming games; drains as season plays out                                                              | 0–272              | 0–272 (rolling)              |
| `scheduledEvents`     | id (auto)     | Future rule/expansion events                                                                            | <10                | <10                          |
| `seasonLeaders`       | season        | Top stat leaders                                                                                        | 1                  | 10                           |
| `teamSeasons`         | rid (auto)    | 1 row per team per season + playoffs. Cache: last 3 seasons                                             | ~64 cached         | ~640 total                   |
| `teamStats`           | rid (auto)    | Team aggregate stats, same shape as teamSeasons                                                         | ~64 cached         | ~640 total                   |
| `teams`               | tid           | 1 row/team; constant                                                                                    | 32                 | 32 (constant)                |
| `trade`               | 0 (singleton) | Current proposed trade                                                                                  | 1                  | 1                            |

**Key SQLite schema decisions (resolved):**

- `players` career stats: **normalize** into a separate `player_stats` table — no JSON blobs
- `games` box scores: **normalize** player box score rows into a separate `game_player_stats` table
- **Box scores are kept for all time.** The current ZenGM engine drops old box scores by default (`saveOldBoxScores` / `autoDeleteOldBoxScores` setting). SQLite is the fix for this — every game's box score is written to SQLite at game time and never deleted.
- `gameAttributes` key/value store: maps to a simple 2-column table (`key`, `value`)
- All other stores: flat tables, 1:1 mapping

### 4. Frequency Bucketing — COMPLETE

**Key finding: GameSim itself makes zero idb calls.** It runs entirely in memory and returns a `GameResults` object. All writes happen _after_ the game completes, in `cbSaveResults` → `writePlayerStats` / `writeTeamStats` / `writeGameStats`. The LLM coach integration point has no SQLite write pressure during play simulation.

#### Tier 1 — Real-time / per-play

| Store    | Access | Notes                                                                |
| -------- | ------ | -------------------------------------------------------------------- |
| _(none)_ | —      | GameSim runs 100% in memory; no db reads or writes during simulation |

#### Tier 2 — Per-game (after each game completes)

These are the hot writes — happen after every simulated game, called from `cbSaveResults` in `game/play.ts`:

| Store           | Access     | Trigger                                               |
| --------------- | ---------- | ----------------------------------------------------- |
| `games`         | write      | Box score written via `writeGameStats`                |
| `players`       | read+write | Stats row appended, injury set — `writePlayerStats`   |
| `teamStats`     | read+write | Aggregate stats updated — `writeTeamStats`            |
| `teamSeasons`   | read+write | W/L record, attendance, financials — `writeTeamStats` |
| `schedule`      | delete     | Completed game removed from upcoming schedule         |
| `headToHeads`   | read+write | H2H record updated — `headToHead.addGame`             |
| `events`        | write      | Game result logged via `logEvent`                     |
| `playerFeats`   | write      | If a player had a statistical feat                    |
| `allStars`      | read+write | All-Star game only — MVP, score                       |
| `playoffSeries` | read+write | Playoff games only — series W/L updated               |

#### Tier 3 — Per-day (football: per-week)

Runs at end of each game day in `cbSaveResults` when `dayOver === true`:

| Store          | Access     | Trigger                                           |
| -------------- | ---------- | ------------------------------------------------- |
| `players`      | read+write | Injury countdown, `gamesUntilTradable` decrement  |
| `negotiations` | write      | `freeAgents.autoSign` — AI teams sign free agents |
| `trade`        | read+write | `trade.betweenAiTeams` — AI-vs-AI trades          |
| `events`       | write      | Injury healed notifications                       |

#### Tier 4 — Per-phase (happens at season phase transitions)

Phase changes: preseason → regular season → playoffs → draft lottery → draft → free agency → resign players → repeat. Each phase writes to multiple stores.

| Store                 | Access       | Notes                                                                                         |
| --------------------- | ------------ | --------------------------------------------------------------------------------------------- |
| `schedule`            | write+clear  | Full season schedule generated at regular season start; playoff schedule built round by round |
| `players`             | write (bulk) | Aging, development, ratings update, retirement — happens each preseason                       |
| `teamSeasons`         | write        | New row per team created each season                                                          |
| `teamStats`           | write        | New row per team created each season                                                          |
| `draftPicks`          | write        | Picks generated, then consumed as players are drafted                                         |
| `playoffSeries`       | write        | Bracket created at playoff start                                                              |
| `awards`              | write        | Written at end of season                                                                      |
| `draftLotteryResults` | write        | Written after lottery                                                                         |
| `seasonLeaders`       | write        | Written once at season end                                                                    |
| `messages`            | write        | Owner messages sent at phase transitions                                                      |
| `gameAttributes`      | write        | Season number incremented, phase updated                                                      |
| `negotiations`        | write+clear  | Free agency — negotiations created and cleared                                                |
| `releasedPlayers`     | write+clear  | Released players tracked for dead cap                                                         |
| `savedTrades`         | clear        | Cleared at season transitions                                                                 |
| `trade`               | write        | Reset to empty at phase transitions                                                           |
| `headToHeads`         | write        | New row per season                                                                            |
| `allStars`            | write        | New row per season                                                                            |

#### Tier 5 — Per-season (once, read-heavy after creation)

These are written once per season and then only read:

| Store                 | Access                                     |
| --------------------- | ------------------------------------------ |
| `awards`              | Written once at season end                 |
| `draftLotteryResults` | Written once after lottery                 |
| `allStars`            | Written once per season                    |
| `headToHeads`         | Written once per season, updated per game  |
| `playoffSeries`       | Written at playoff start, updated per game |
| `seasonLeaders`       | Written once at season end                 |

#### SQLite write priority (for conversion sequencing)

1. **`games` + `game_player_stats`** — per-game, write-once, never deleted — highest value, aligns with box score retention goal
2. **`players` + `player_stats`** — per-game updates (stats row), per-phase bulk updates
3. **`teamStats` + `teamSeasons`** — per-game
4. **Phase-transition stores** (schedule, draftPicks, awards, etc.) — lower frequency, lower urgency

### 5. Write Path Isolation — COMPLETE

**Total write call sites: 241 cache + 12 meta = 253 total**

However, all 241 cache writes funnel through a single point: `Cache.flush()` in `Cache.ts`. Replacing flush() covers all 241 automatically — they never need to be touched individually.

The 12 `idb.meta` writes are direct (no cache layer) and must each be replaced individually.

#### idb.cache writes by store (241 total — all covered by Cache.flush())

| Store                 | Write calls | Priority                                                 |
| --------------------- | ----------- | -------------------------------------------------------- |
| `players`             | 81          | High — touched everywhere; stats, injuries, ratings      |
| `teams`               | 32          | High                                                     |
| `teamSeasons`         | 20          | High — per-game                                          |
| `scheduledEvents`     | 19          | Medium                                                   |
| `schedule`            | 17          | Medium                                                   |
| `draftPicks`          | 12          | Medium                                                   |
| `allStars`            | 10          | Low                                                      |
| `teamStats`           | 6           | High — per-game                                          |
| `messages`            | 6           | Low                                                      |
| `playoffSeries`       | 5           | Medium                                                   |
| `awards`              | 5           | Low                                                      |
| `trade`               | 4           | Low                                                      |
| `savedTrades`         | 4           | Low                                                      |
| `releasedPlayers`     | 4           | Low                                                      |
| `negotiations`        | 4           | Low                                                      |
| `seasonLeaders`       | 2           | Low                                                      |
| `savedTradingBlock`   | 2           | Low                                                      |
| `headToHeads`         | 2           | Low                                                      |
| `games`               | 2           | **Critical** — box score write; write-once, never delete |
| `gameAttributes`      | 2           | Medium                                                   |
| `draftLotteryResults` | 2           | Low                                                      |
| `playerFeats`         | 1           | Low                                                      |
| `events`              | 1           | Low                                                      |

Note: `games` shows only 2 call sites because `writeGameStats` calls `.put()` once per game and `.delete()` is called in `newPhaseRegularSeason` to purge old box scores — which we will NOT replicate in SQLite (box scores are kept forever).

#### idb.meta writes (12 total — must each be replaced individually)

| File                                  | Operation                                   | Purpose                       |
| ------------------------------------- | ------------------------------------------- | ----------------------------- |
| `core/league/createStream.ts`         | `add("leagues")`                            | Create new league record      |
| `core/league/remove.ts`               | `delete("leagues")`                         | Delete league                 |
| `core/league/clone.ts`                | `add("leagues")`                            | Clone league                  |
| `core/phase/newPhaseRegularSeason.ts` | `put("leagues")`, `put("attributes")` x3    | Update league meta, nag flags |
| `util/beforeView.ts`                  | `put("leagues")`                            | Update lastPlayed             |
| `util/checkChanges.ts`                | `put("attributes")`                         | Track version                 |
| `util/checkAccount.ts`                | `clear("achievements")`                     | Clear achievements            |
| `api/index.ts`                        | `delete("attributes")`, `put("attributes")` | Settings overrides            |
| `db/connectLeague.ts`                 | `put("leagues")`                            | Migration step                |

`idb.meta` covers two stores: `leagues` (one row per league — name, lid, lastPlayed, etc.) and `attributes` (app-level key/value pairs). Both need SQLite tables.

#### Key conclusion

- **One replacement point** covers 241 write sites: swap `Cache.flush()` to write to SQLite instead of IDB
- **12 targeted replacements** for meta writes (league management, app attributes)
- **Zero writes happen during GameSim** — confirmed again; all writes are post-game

### 6. Real-Time Path Deep Dive — COMPLETE

#### How a game runs

1. `loadTeams()` reads from `idb.cache` — players, teams, teamSeasons, gameAttributes — and builds in-memory team objects
2. `new GameSim(...).run()` executes the entire game in memory
3. `run()` calls `simRegulation()` → `simPlay()` in a loop until the game ends
4. After `run()` returns, `cbSaveResults` performs all db writes (writePlayerStats, writeTeamStats, writeGameStats)

**Writes are 100% batched — there are zero per-play db writes.** All SQLite writes happen once after the game ends.

#### Per-play call chain (football)

```
simPlay()
  → getPlayType()          — pure in-memory logic; no db calls
      → coachSidecarPlayCall()   — HTTP POST to sidecar if COACH_SIDECAR_BASE_URL is set
          payload: game state snapshot (see below)
          returns: "run" | "pass" | "fieldGoal" | "punt"
      → fallback: Math.random() < this.probPass()  if sidecar unavailable
  → new Play(this)         — executes the play in memory
```

#### Game state payload sent to the sidecar per play

Everything is computed from in-memory fields on the GameSim object — no db reads:

```
gid, leagueId
offenseId, defenseId
down, toGo, scrimmage
quarter, clockMinutes
offenseScore, defenseScore
offenseTimeouts, defenseTimeouts
canPunt, canKickFieldGoal, fieldGoalProbability
rushAttempts, rushYards           — running totals from current game
passAttempts, passCompletions, passYards
```

No historical data (prior games, season stats, opponent tendencies) is sent today. The sidecar only sees the current game state.

#### Post-game sidecar callback

After `run()` completes, a second call is made to the sidecar with a game result summary (team-level stats: score, rush/pass attempts/yards/TDs/INTs). This is the hook for the coach to update its memory.

#### Implications for SQLite conversion

- **No per-play SQLite writes needed** — game runs entirely in memory, writes flush at game end
- **The payload is already well-defined** — adding historical context to coach decisions means adding SQLite queries before the play call, not changing the GameSim
- **Post-game callback is the coach memory write point** — this is where the sidecar/coach module should write observations to its SQLite coach_memory table

#### Runtime decision — Electron (resolved)

Browser + OPFS traps the SQLite file inside browser internal storage — the coach agent cannot access it from outside. Node.js / Electron puts the SQLite file on disk at any path. **Electron is the chosen runtime.** This also means sidecar consolidation becomes in-process (task 8).

### 7. Risk and Scope Summary — COMPLETE

#### Total write surface

| Surface                                             | Count         | Replacement effort                       |
| --------------------------------------------------- | ------------- | ---------------------------------------- |
| `idb.cache` write call sites                        | 241           | **1 replacement** — swap `Cache.flush()` |
| `idb.cache` read-into-memory (`fill()`)             | 1 entry point | **1 replacement** — swap `Cache.fill()`  |
| `idb.league` direct reads (getCopies, views, utils) | 28 files      | **28 individual SQL SELECT rewrites**    |
| `idb.meta` write call sites                         | 12            | **12 individual replacements**           |

**There is a clean abstraction layer.** This is not surgery throughout the codebase.

#### DB version context

- Current DB version: **71**
- Migration steps in `connectLeague.ts`: **56**
- A SQLite migration framework must be built to replace the IDB upgrade path — and kept in sync with upstream going forward (see task 9)

#### Risk areas — ranked

**1. players normalization (HIGH)**
81 write sites, career stats embedded as a nested array inside each player row. Every `players.put()` that touches stats must upsert rows in a separate `player_stats` table. The schema design here is the longest pole in the project.

**2. Cache.fill() / Cache.flush() correctness (HIGH)**
These two methods are the load and save of the entire game state. A bug here corrupts the league. Must be exact. Well-isolated — the risk is in correctness, not scope.

**3. getCopies/players.ts query complexity (HIGH)**
The most complex of the 28 direct-access files. Uses compound IDB indexes (`draft.year, retiredYear`) with range queries. Six different query paths in one file.

**4. autoFlush timing decision (MEDIUM)**
Current design batches all writes every 4 seconds. Moving writes to `_storeObj()/_delete()` (immediate per-write) means potentially hundreds of individual SQLite writes per simulated game. Needs a benchmark.

**5. Migration framework (MEDIUM)**
56 existing IDB migration steps cannot be ported literally. Only the _current_ schema matters at initial build. A forward migration framework must exist for future schema changes.

**6. idb.meta (LOW-MEDIUM)**
Separate DB with 2 stores (`leagues`, `attributes`). Small surface (12 write sites). Likely a second SQLite file or reserved tables.

**7. games/game_player_stats normalization (LOW-MEDIUM)**
Box score normalization is simpler than players because box scores are write-once. Get the schema right up front — retroactive changes on a large append-only table are painful.

**8. Real-time path (LOW)**
GameSim makes zero db calls during simulation. No risk here.

#### Scope estimate

| Area                                 | Size         | Notes                                                                   |
| ------------------------------------ | ------------ | ----------------------------------------------------------------------- |
| Schema design (players, games, meta) | Large        | Longest pole — get this right before writing any code                   |
| Cache.flush() → SQLite               | Medium       | Well-isolated, high correctness bar                                     |
| Cache.fill() → SQLite                | Medium       | Same                                                                    |
| getCopies 28 files → SQL             | Medium-Large | players.ts is hardest; most others are simple getAll()                  |
| idb.meta 12 sites                    | Small        | Straightforward                                                         |
| SQLite migration framework           | Medium       | Must exist before any league data is written                            |
| Testing                              | Large        | Biggest unknown; no existing integration test harness for storage layer |

**Overall: Large project.** Clean abstraction means the blast radius per change is small, but schema design and the migration framework make this a multi-week effort.

#### Implementation strategy — immediate cutovers, no dual-write

Each store is cut over completely in one commit — IDB removed for that store, SQLite live. Leagues in use during migration are disposable. Commit and push after each successful store cutover.

### 8. Sidecar Consolidation — PLANNING COMPLETE

**Current sidecar state (as of 2026-06-06):**

- Repo: `https://github.com/MichaelEbbert/zengm-coach`
- Local: `C:\claude_projects\zengm-coach\` (Windows) and `/home/michael/claude_projects/zengm-coach/` (Linux)
- Language: Python (FastAPI)
- Logic: 100% deterministic — no LLM calls at all
- `play_decision.py`: `determine_mode()` (desperation/protection/normal based on score_diff/quarter/clock), `play_decision()` (run/pass via if/else + YPC/YPA ratio with randomness on 1st down)
- `fourth_down.py`: `fourth_down_decision()` (fieldGoal/punt/go based on scrimmage position, FG probability thresholds, mode)
- `main.py`: FastAPI server, CORS middleware, SQLite logging to `stats.db` (play_log + game_results tables)
- Speed: entire 3.5s overhead vs. baseline is HTTP round-trip × ~150 plays. After merging to TypeScript in-process, game sim returns to ~2.5s baseline.

Detailed implementation plan: **See Phase 8** in the Implementation Phases section below.

### 9. Upstream Sync — PLANNING COMPLETE

- Upstream repo: `https://github.com/zengm-games/zengm`
- Our fork: `https://github.com/MichaelEbbert/zengm`
- **Fork baseline:** `d870ac071` ("When calculating seasonLeaders...", May 1, 2026) — last upstream commit before our first custom commit `96476b802`
- No upstream remote is configured yet — must add before any diff work (see Phase 9, step 9.1)
- Manual diff review is preferred over `git merge`/`git rebase` because:
  - Our SQLite changes will diverge structurally from upstream's IndexedDB code
  - Sidecar consolidation removes code that upstream still has — a merge would reintroduce it
  - Upstream housekeeping commits (JSON schema updates, etc.) need translation to SQLite migrations in our code, not literal application
- Most critical upstream category to watch: `connectLeague.ts` migration steps — each new IDB migration step upstream must be translated to a new SQLite migration in our framework

Detailed process: **See Phase 9** in the Implementation Phases section below.

## Implementation Phases

Leagues used during migration are disposable. Commit and push after each successful phase.

---

### Phase 1 — Electron Runtime Conversion (DB untouched)

Goal: game runs in Electron with IndexedDB still intact. UI identical to today. No game logic changes.

- [ ] 1.1 Audit browser-specific globals — grep for `self`, `window`, `navigator`, `location` in worker code; catalog what needs changing
- [ ] 1.2 Add Electron to the project — install `electron@^35.0.0` and `electron-builder` as dev dependencies (35.x is the version already in use by the sibling `poker-sim` project and is confirmed working on this machine)
- [ ] 1.3 Write Electron main process entry point — create `electron/main.ts`; adapt the pattern from `C:\claude_projects\poker-sim\ui\main.js` as a reference:
  - `contextIsolation: true`, `nodeIntegration: false`, `preload` script for the renderer bridge — use this exact security model
  - In dev: point BrowserWindow at the Vite dev server URL (e.g. `http://localhost:3000`) instead of a static file
  - In prod: load the built `index.html` (same as poker-sim's `mainWindow.loadFile(...)`)
  - Add `before-quit` handler to clean up any child processes (same pattern poker-sim uses to kill its Java process)
- [ ] 1.4 Rewrite the postMessage/onmessage bridge — replace browser web worker communication with Electron IPC (`ipcMain` / `ipcRenderer` / `contextBridge`)
- [ ] 1.5 Fix browser global references found in 1.1
- [ ] 1.6 Verify the game runs end to end in Electron — create league, sim games, check box scores, advance season
- [x] 1.7 Add local HTTP API to Electron main process — Node `http` server on `127.0.0.1:3001` (ELECTRON_API_PORT override). Uses `win.webContents.executeJavaScript()` to call `window.bbgm.toWorker()` in the renderer — no preload or IPC bridge needed. Endpoints: `GET /status`, `POST /sim/{day,week,month,untilPlayoffs,throughPlayoffs,untilDraft,untilResignPlayers,untilFreeAgency,untilPreseason,untilRegularSeason}`, `POST /draft/{onePick,untilEnd,pick}`, `GET /query` (stub until Phase 2)
- [ ] 1.8 Verify API drives a full season programmatically — sim day loop until phase advances, repeat through draft and free agency
- [ ] 1.9 Commit and push

---

### Phase 2 — Box Scores to SQLite (`games` + `game_player_stats`)

Goal: box scores written to and read from SQLite. IndexedDB still used for everything else.

- [ ] 2.1 Design `games` and `game_player_stats` SQLite schema — finalize column names, types, indexes
- [ ] 2.2 Add `better-sqlite3` to the project
- [ ] 2.3 Write SQLite migration framework — versioned migration files, applied at app startup
- [ ] 2.4 Write migration 001 — create `games` and `game_player_stats` tables
- [ ] 2.5 Replace `idb.cache.games.put()` in `writeGameStats.ts` with SQLite insert
- [ ] 2.6 Replace `idb.league` direct reads in `getCopies/games.ts` with SQLite queries
- [ ] 2.7 Remove the `games` store delete call in `newPhaseRegularSeason.ts` (box scores kept forever)
- [ ] 2.8 Remove `games` from `Cache.ts` STORES list and storeInfos
- [ ] 2.9 Verify box score display works end to end
- [ ] 2.10 Commit and push

---

### Phase 3 — Players to SQLite (`players` + `player_stats`)

Goal: player records and career stats written to and read from SQLite.

- [ ] 3.1 Design `players` and `player_stats` SQLite schema — normalize career stats array into rows
- [ ] 3.2 Write migration 002 — create `players` and `player_stats` tables
- [ ] 3.3 Replace `Cache.flush()` dirty-record writes for `players` store with SQLite upserts
- [ ] 3.4 Replace `Cache.fill()` player load with SQLite query
- [ ] 3.5 Replace `getCopies/players.ts` direct IDB reads with SQL queries (6 query paths — hardest file)
- [ ] 3.6 Remove `players` from Cache STORES
- [ ] 3.7 Verify player stats, ratings, and history display correctly
- [ ] 3.8 Commit and push

---

### Phase 4 — Team Stores to SQLite (`teams`, `teamSeasons`, `teamStats`)

- [ ] 4.1 Design schema for all three stores
- [ ] 4.2 Write migration 003
- [ ] 4.3 Replace flush/fill for all three stores
- [ ] 4.4 Replace any getCopies direct reads
- [ ] 4.5 Remove from Cache STORES
- [ ] 4.6 Verify standings, team history, finances display correctly
- [ ] 4.7 Commit and push

---

### Phase 5 — Remaining Game Stores

Stores: `schedule`, `draftPicks`, `playoffSeries`, `events`, `playerFeats`, `headToHeads`, `awards`, `draftLotteryResults`, `seasonLeaders`, `allStars`, `negotiations`, `releasedPlayers`, `messages`, `trade`, `savedTrades`, `savedTradingBlock`, `scheduledEvents`, `gameAttributes`

- [ ] 5.1 Design schemas for all remaining stores
- [ ] 5.2 Write migration 004
- [ ] 5.3 Replace flush/fill and any getCopies reads for each store
- [ ] 5.4 Remove each store from Cache STORES as it is cut over
- [ ] 5.5 Verify full game cycle: preseason → regular season → playoffs → draft → free agency
- [ ] 5.6 Commit and push

---

### Phase 6 — Meta DB to SQLite (`leagues`, `attributes`)

- [ ] 6.1 Design `leagues` and `attributes` tables
- [ ] 6.2 Write migration 005
- [ ] 6.3 Replace all 12 `idb.meta` write sites
- [ ] 6.4 Replace `idb.meta` read sites
- [ ] 6.5 Verify league creation, deletion, dashboard display
- [ ] 6.6 Commit and push

---

### Phase 7 — Remove IndexedDB

Goal: IDB code deleted entirely. SQLite is the only persistence layer.

- [ ] 7.1 Remove `connectLeague.ts`, `connectMeta.ts`, `connectIndexedDB.ts`, `SafeIdb.ts`
- [ ] 7.2 Remove `@dumbmatter/idb` dependency
- [ ] 7.3 Remove any remaining IDB references
- [ ] 7.4 Full regression: create league, sim full season, verify all views
- [ ] 7.5 Commit and push

---

### Phase 8 — Sidecar Consolidation

Goal: Port Python FastAPI play-calling logic into ZenGM TypeScript. Eliminate two-process architecture and HTTP overhead (~3.5s/game). Game sim returns to ~2.5s baseline. Preserve the per-play decision log (previously in sidecar's `stats.db`) — re-wired to the league SQLite DB.

Prerequisites: Sub-tasks 8.1–8.11 have no prerequisites (can be done before phases 1–7). Sub-task 8.12 (play-call logging) requires Phase 2 (`better-sqlite3` in place).

**Part A — Logic port (no prerequisites)**

- [ ] 8.1 Fill out unit tests in `zengm-coach` (user-driven)
  - Run an agent in `C:\claude_projects\zengm-coach\` to audit current test coverage
  - Set a coverage target (e.g. 80% of decision paths)
  - Add Python tests in `zengm-coach/tests/` to reach the target
  - All tests must pass before moving to 8.2

- [ ] 8.2 Remove dead LLM code in ZenGM
  - Delete `src/worker/core/GameSim.football/llm.integration.test.ts`
  - Remove `GROQ_API_KEY` from `tools/lib/rolldownConfig.ts` define block

- [ ] 8.3 Read the Python sidecar source from `C:\claude_projects\zengm-coach\`
  - Read `play_decision.py` — transcribe `determine_mode()` and `play_decision()` logic
  - Read `fourth_down.py` — transcribe `fourth_down_decision()` logic
  - Catalog all test cases in `tests/` to port in sub-task 8.5

- [ ] 8.4 Create `src/worker/core/GameSim.football/coach.ts`
  - Port `determine_mode(gameState) → "desperation" | "protection" | "normal"` — pure arithmetic on score_diff/quarter/clock
  - Port `play_decision(gameState, mode) → "run" | "pass"` — if/else + YPC/YPA ratio with randomness on 1st down
  - Port `fourth_down_decision(gameState, mode) → "fieldGoal" | "punt" | "go"` — FG probability thresholds + scrimmage position thresholds
  - All functions synchronous — no HTTP, no I/O, no imports beyond game state types

- [ ] 8.5 Create `src/worker/core/GameSim.football/coach.test.ts`
  - Use existing `genTwoTeams()` / `initGameSim()` helpers from `index.test.ts`
  - Test all three branches of `determine_mode()` (desperation, protection, normal)
  - Test main decision paths for `play_decision()` and `fourth_down_decision()`
  - Port every test case from `zengm-coach/tests/` (added in sub-task 8.1) to vitest

- [ ] 8.6 Replace `coachSidecarPlayCall()` in `index.ts` with inline coach calls
  - In `getPlayType()` 4th down path (~line 933): call `fourthDownDecision(gameState, mode)` directly
  - In `getPlayType()` standard path (~line 1023): call `playDecision(gameState, mode)` directly
  - Build `gameState` inline from the same GameSim fields already used in `coachSidecarPlayCall()`
  - Delete `coachSidecarPlayCall()` method
  - Delete `COACH_SIDECAR_PLAY_CALLING` and `COACH_SIDECAR_BASE_URL` constants
  - Delete `probPass()` — it is now unreachable

- [ ] 8.7 Remove game-result POST from `run()`
  - Find and remove the `/game-result` fetch + retry loop at the end of `run()`
  - Per-game aggregate stats are not needed; only per-play decisions matter (sub-task 8.12)

- [ ] 8.8 Make `getPlayType()` synchronous
  - Remove `async` / `await` from `getPlayType()` and its two coach call sites
  - In `src/worker/core/game/play.ts`: verify no other async callers remain; revert async if safe
  - In `src/worker/api/exhibitionGame.ts`: same check and revert

- [ ] 8.9 Remove `COACH_SIDECAR_URL` from `tools/lib/rolldownConfig.ts` define block

- [ ] 8.10 Run tests — `SPORT=football node --run test` — all must pass

- [ ] 8.11 Manual smoke test — start dev server, create league, sim a game
  - Verify play calls look reasonable (no all-pass or all-run streaks)
  - Verify no `[COACH_SIDECAR]` warnings in console
  - Verify game sim completes in ~2.5s (vs. prior ~6s)
  - Commit and push

**Part B — Play-call logging (requires Phase 2)**

- [ ] 8.12 Add `play_calls` table to the league SQLite migration
  - Write migration adding `play_calls` table: `(id INTEGER PRIMARY KEY, gid, leagueId, offenseId, defenseId, down, toGo, scrimmage, quarter, clockMinutes, offenseScore, defenseScore, offenseTimeouts, defenseTimeouts, mode, decision, timestamp)`
  - Wire an INSERT into `coach.ts` after each call to `play_decision()` / `fourth_down_decision()`; pass the DB handle via a parameter so coach.ts stays free of module-level state
  - Verify rows appear in the DB after simming a game
  - Commit and push

---

### Phase 9 — Upstream Sync Process

Goal: Establish a repeatable, low-friction process for reviewing `zengm-games/zengm` upstream changes and selectively applying them — preserving our structural divergence (SQLite conversion, sidecar consolidation) while keeping useful upstream improvements.

This phase has two parts: one-time setup (9.1–9.3) and a per-sync workflow to repeat whenever upstream needs to be reviewed (9.4–9.9). The per-sync workflow should be run in plan mode.

Prerequisites: None for setup. Translating DB migrations (9.7) requires Phase 2 (SQLite migration framework).

**Part A — One-time setup**

- [ ] 9.1 Add upstream remote and fetch
  - `git remote add upstream https://github.com/zengm-games/zengm`
  - `git fetch upstream`

- [ ] 9.2 Record fork baseline in this document
  - Fork baseline: `d870ac071` ("When calculating seasonLeaders...", May 1, 2026) — last upstream commit before our first custom commit `96476b802`
  - This SHA is already recorded in Task 9 above; confirm it appears in `upstream/master` history after fetching

- [ ] 9.3 Initial upstream audit — categorize all commits since baseline
  - Run: `git log --oneline d870ac071..upstream/master`
  - For each commit (or logical batch), assign a category:
    - **A — Apply directly:** bug fixes or improvements in files we haven't touched
    - **B — Translate:** new `upgrade<N>()` steps in `connectLeague.ts` → must become SQLite migrations in our framework
    - **C — Manual merge:** changes to our modified files (`GameSim.football/index.ts`, `game/play.ts`, `exhibitionGame.ts`, `rolldownConfig.ts`) — review line by line
    - **D — Skip:** changes to IDB infrastructure we're replacing (Cache.ts, connectLeague.ts schema, SafeIdb.ts, connectMeta.ts)
  - Create `docs/upstream_sync_log.md` with columns: upstream SHA | description | category | status

**Part B — Per-sync workflow (repeat as needed, run in plan mode)**

- [ ] 9.4 Fetch latest upstream and identify new commits
  - `git fetch upstream`
  - `git log --oneline <last-synced-sha>..upstream/master`
  - Add new commits to `docs/upstream_sync_log.md`

- [ ] 9.5 Review each commit or batch in plan mode
  - `git show <sha> -- <file>` or `git diff <sha>^..<sha>` for targeted inspection
  - Assign category A/B/C/D to each
  - For category B: note the upgrade number and what schema/data change it makes

- [ ] 9.6 Apply category A changes (safe applies)
  - Cherry-pick or manually apply; run `SPORT=football node --run test` after each
  - Record in `docs/upstream_sync_log.md`: upstream SHA → our commit SHA, status = applied

- [ ] 9.7 Translate category B changes (DB migrations)
  - For each new `upgrade<N>()` in upstream `connectLeague.ts`: determine the schema/data change, write the equivalent SQLite migration in our framework
  - Record: upstream upgrade N → our SQLite migration file, status = translated

- [ ] 9.8 Handle category C changes (manual merge for our modified files)
  - Read the upstream diff; read our version; apply the upstream intent without overwriting our changes
  - Run `SPORT=football node --run test`; record in `docs/upstream_sync_log.md`, status = merged

- [ ] 9.9 Update sync baseline
  - Record the new `<last-synced-sha>` in `docs/upstream_sync_log.md`
  - Commit `docs/upstream_sync_log.md` with all status updates

## Notes
