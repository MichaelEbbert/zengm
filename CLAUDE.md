# CLAUDE.md - ZenGM Football (Coach Fork)

This is a fork of [zengm-games/zengm](https://github.com/zengm-games/zengm), modified to add a deterministic play-calling coach module. Development splits between ThinkPad (Linux, 192.168.1.29) and Windows desktop (192.168.1.18).

---

## Repos Involved

| Repo                | Location                                                                                           | Purpose                        |
| ------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------ |
| `zengm` (this repo) | `/home/michael/claude_projects/zengm/` (Linux) · `C:\claude_projects\zengm\` (Windows)             | Game engine — TypeScript       |
| `zengm-coach`       | `/home/michael/claude_projects/zengm-coach/` (Linux) · `C:\claude_projects\zengm-coach\` (Windows) | Coach sidecar — Python FastAPI |

Upstream: `https://github.com/zengm-games/zengm`
Our fork: `https://github.com/MichaelEbbert/zengm`
Coach sidecar: `https://github.com/MichaelEbbert/zengm-coach`

---

## Project State (2026-06-06)

### Current Architecture

```
ZenGM (TypeScript, browser web worker)
    └── coachSidecarPlayCall()
            └── POST http://{host}:3004/play  →  zengm-coach (Python FastAPI)
                    ├── determine_mode()       — desperation / protection / normal
                    ├── play_decision()        — run/pass logic (if/else + YPC/YPA ratio)
                    └── fourth_down_decision() — fieldGoal / punt / go for it
                    └── logs to stats.db (SQLite)
```

**The sidecar is 100% deterministic — no LLM calls.** The HTTP round-trip overhead is ~3.5s/game × ~150 plays ≈ 6s total vs. 2.5s baseline. After merging sidecar into ZenGM TypeScript (task 8), sim returns to ~2.5s.

---

## Active Plans

### DB Conversion (research complete, not started)

Full plan: `docs/db_conversion.md`

Summary: Convert ZenGM from browser IndexedDB to SQLite + Electron runtime.

- Research tasks 1-7: COMPLETE (all analysis done)
- Tasks 8-9: defined, not yet executed (see below)
- Implementation phases 1-7: defined in `docs/db_conversion.md`, not started

**Key architectural decisions made:**

- Runtime: **Electron** (not browser — OPFS traps SQLite from external access)
- Storage: **`better-sqlite3`** in Electron main process
- No dual-write: each store is cut over immediately, leagues during migration are disposable
- Players career stats: normalized into `player_stats` table (no JSON blobs)
- Box scores: kept forever (never deleted), normalized into `game_player_stats` table
- Phase 1 (Electron conversion) comes first — DB untouched, UI identical
- Phase 1 also adds a localhost HTTP API (~8 action endpoints + SQL query endpoint) for programmatic control

**Key facts for implementation:**

- `Cache.flush()` is the single point that covers all 241 write sites
- `Cache.fill()` is the single load point
- 28 files use `idb.league` directly (historical reads) — each needs SQL SELECT
- 12 `idb.meta` write sites — must replace individually
- GameSim makes ZERO db calls during simulation — all writes are post-game

### Task 8 — Sidecar Consolidation (not started)

Move sidecar logic into ZenGM TypeScript, eliminating the two-process architecture.
See `docs/db_conversion.md` task 8 for full sub-task list.

Key facts about current sidecar:

- `play_decision.py`: `determine_mode()` + `play_decision()` — pure arithmetic + if/else + random() on 1st down
- `fourth_down.py`: `fourth_down_decision()` — FG probability thresholds + position thresholds
- `main.py`: FastAPI server, CORS, SQLite logging
- Port to TypeScript is straightforward line-for-line conversion

### Task 9 — Upstream Sync (not started)

Record details for future upstream sync approach. See `docs/db_conversion.md` task 9.
Upstream diverges increasingly as we add Electron + SQLite. Manual diff review preferred.

---

## Machine Notes

| Machine          | IP            | Notes                  |
| ---------------- | ------------- | ---------------------- |
| ThinkPad (Linux) | 192.168.1.29  | Primary dev machine    |
| Windows Desktop  | 192.168.1.18  | Secondary dev machine  |
| Laptop           | 192.168.1.142 | Sometimes runs sidecar |

---

## Running the Dev Server

**Linux (standard):**

```bash
COACH_SIDECAR_URL=http://192.168.1.142:3004 SPORT=football node --run dev -- --host
```

**Linux (background, LAN-accessible):**

```bash
nohup bash -c 'COACH_SIDECAR_URL=http://192.168.1.142:3004 SPORT=football node --run dev -- --host' < /dev/null > /tmp/zengm-dev.log 2>&1 &
echo "PID: $!"
```

**PowerShell:**

```powershell
$env:COACH_SIDECAR_URL="http://192.168.1.29:3004"; $env:SPORT="football"; node --run dev
```

Add `-- --host` to bind to `0.0.0.0` and make it LAN-accessible.

**Stop it (PowerShell):**

```powershell
Stop-Process -Id <PID>
# or if you lost the PID:
Stop-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess
```

Set `COACH_SIDECAR_URL` to whichever machine is running the sidecar. Without it, falls back to `Math.random() < this.probPass()`.

Node 24 (nvm) and pnpm 10 required.

---

## Running in Electron (Phase 1)

Start the dev server in one terminal (see above), then in a second terminal:

```powershell
node --run electron
```

The Electron app loads `http://localhost:3000`. If the dev server started on a different port (check its output), override with:

```powershell
$env:ELECTRON_DEV_PORT="3001"; node --run electron
```

Electron must be installed first: `pnpm install` (requires network access).

### Electron DB path (per-machine setup)

`electron/settings.json` is gitignored. Each machine must create it once:

```json
{
	"dbPath": "/path/to/your/zengm.db"
}
```

Windows Desktop example:

```json
{
	"dbPath": "D:\\Dropbox\\Gaming and Magic and Comics\\ZenGM\\db\\zengm.db"
}
```

If `settings.json` is absent, the DB falls back to Electron's `userData` folder (`%APPDATA%\Electron\zengm.db` on Windows).

### Electron HTTP API (Session 2)

An HTTP API server starts automatically on `http://127.0.0.1:3001` alongside Electron. It uses `win.webContents.executeJavaScript()` to call `window.bbgm.toWorker()` in the renderer — no preload script or IPC bridge needed.

Override port with `ELECTRON_API_PORT`.

| Method | Path                      | Action                                 |
| ------ | ------------------------- | -------------------------------------- |
| GET    | `/status`                 | Current `{ phase, season }`            |
| POST   | `/sim/day`                | Sim one day                            |
| POST   | `/sim/week`               | Sim one week                           |
| POST   | `/sim/month`              | Sim one month                          |
| POST   | `/sim/untilPlayoffs`      | Sim through regular season             |
| POST   | `/sim/throughPlayoffs`    | Sim through playoffs                   |
| POST   | `/sim/untilDraft`         | Advance to draft phase                 |
| POST   | `/draft/onePick`          | Sim one AI draft pick                  |
| POST   | `/draft/untilEnd`         | Sim rest of draft                      |
| POST   | `/draft/pick`             | User draft pick — body: `{"pid": 123}` |
| POST   | `/sim/untilResignPlayers` | Advance to resign players              |
| POST   | `/sim/untilFreeAgency`    | Advance to free agency                 |
| POST   | `/sim/untilPreseason`     | Sim through free agency                |
| POST   | `/sim/untilRegularSeason` | Advance to regular season start        |
| GET    | `/query`                  | SQL (stub — available in Phase 2)      |

Quick test (with a league open in Electron):

```powershell
Invoke-RestMethod http://127.0.0.1:3001/status
Invoke-RestMethod -Method Post http://127.0.0.1:3001/sim/day
```

Full season automation sequence:

```powershell
Invoke-RestMethod -Method Post http://127.0.0.1:3001/sim/untilPlayoffs
Invoke-RestMethod -Method Post http://127.0.0.1:3001/sim/throughPlayoffs
Invoke-RestMethod -Method Post http://127.0.0.1:3001/sim/untilDraft
Invoke-RestMethod -Method Post http://127.0.0.1:3001/draft/untilEnd
Invoke-RestMethod -Method Post http://127.0.0.1:3001/sim/untilResignPlayers
Invoke-RestMethod -Method Post http://127.0.0.1:3001/sim/untilFreeAgency
Invoke-RestMethod -Method Post http://127.0.0.1:3001/sim/untilPreseason
Invoke-RestMethod -Method Post http://127.0.0.1:3001/sim/untilRegularSeason
```

Each call blocks until the action completes before returning.

---

## Running the Sidecar

From `zengm-coach/`:

```bash
uvicorn main:app --host 0.0.0.0 --port 3004
```

---

## Running Tests

```bash
# Unit tests only (no sidecar calls)
SPORT=football node --run test
```

---

## Modified Files (from upstream)

### `src/worker/core/GameSim.football/index.ts`

- `coachSidecarPlayCall()` added — POSTs game state JSON to sidecar, returns play decision
- `COACH_SIDECAR_PLAY_CALLING = process.env.NODE_ENV !== "test"`
- `COACH_SIDECAR_BASE_URL = process.env.COACH_SIDECAR_URL ?? ""`
- Falls back to `Math.random() < this.probPass()` if sidecar URL unset or call fails

### `tools/lib/rolldownConfig.ts`

- `COACH_SIDECAR_URL` added to `define` block so rolldown bundles it into the worker

### `src/worker/core/game/play.ts`

- Async/await plumbing for the sidecar call path

### `src/worker/api/exhibitionGame.ts`

- Minor async change to support the async play-calling path

---

## Upstream Reference

Upstream: `https://github.com/zengm-games/zengm`
Branch: `master`

To pull upstream changes manually: `git pull upstream master` (add upstream remote first if needed).
Preferred approach: manual diff review in plan mode (see task 9 / `docs/db_conversion.md`).
