# CLAUDE.md - ZenGM Football (Coach Fork)

This is a fork of [zengm-games/zengm](https://github.com/zengm-games/zengm), modified to add a deterministic play-calling coach module. Development splits between ThinkPad (Linux, 192.168.1.29) and Windows desktop (192.168.1.18).

---

## Repos Involved

| Repo                | Location                                                                                           | Purpose                         |
| ------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------- |
| `zengm` (this repo) | `/home/michael/claude_projects/zengm/` (Linux) / `C:\claude_projects\zengm\` (Windows)             | Game engine -- TypeScript       |
| `zengm-coach`       | `/home/michael/claude_projects/zengm-coach/` (Linux) / `C:\claude_projects\zengm-coach\` (Windows) | Coach sidecar -- Python FastAPI |

Upstream: `https://github.com/zengm-games/zengm`
Our fork: `https://github.com/MichaelEbbert/zengm`
Coach sidecar: `https://github.com/MichaelEbbert/zengm-coach`

---

## Project State (2026-07-20)

### Current Architecture

```
ZenGM (TypeScript, browser web worker, Electron runtime)
    +-- coachPlayCall()  [src/worker/core/GameSim.football/coachDecision.ts]
            +-- determineMode()       -- desperation / protection / normal
            +-- playDecision()        -- run/pass logic (if/else + YPC/YPA ratio)
            +-- fourthDownDecision()  -- fieldGoal / punt / go for it
```

**No sidecar process.** Coach logic runs in the worker thread — pure TypeScript, no HTTP round-trips. Sim speed is ~2.5s/game (same as baseline).

**DB:** All stores migrated to SQLite via `better-sqlite3` in Electron main process (Phases 1-7 complete).

---

## Active Plans

### DB Conversion -- COMPLETE (Phases 1-8 done)

Full plan: `docs/db_conversion.md`

- Phases 1-7: SQLite migration complete, all stores cut over
- Phase 8: Sidecar consolidation complete (coach logic now in `coachDecision.ts`)

### Task 9 -- Upstream Sync (not started)

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
SPORT=football node --run dev -- --host
```

**Linux (background, LAN-accessible):**

```bash
nohup bash -c 'SPORT=football node --run dev -- --host' < /dev/null > /tmp/zengm-dev.log 2>&1 &
echo "PID: $!"
```

**PowerShell:**

```powershell
$env:SPORT="football"; node --run dev
```

Add `-- --host` to bind to `0.0.0.0` and make it LAN-accessible.

**Stop it (PowerShell):**

```powershell
Stop-Process -Id <PID>
# or if you lost the PID:
Stop-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess
```

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

### Rebuilding native modules (better-sqlite3)

`better-sqlite3` is a native module compiled against a specific Node ABI. It must be rebuilt to match Electron's ABI whenever you switch Node versions or set up a new machine. `pnpm rebuild` uses the system Node ABI (wrong); use `@electron/rebuild` instead.

`@electron/rebuild` is not in `package.json` -- install it to your home directory once per machine:

```powershell
# Windows: if pnpm install gets ECONNRESET, IPv6 may be broken on the machine;
# force IPv4 for the install only:
$env:NODE_OPTIONS="--dns-result-order=ipv4first"; pnpm add @electron/rebuild
```

Then rebuild from the project directory using the home-dir binary (omit `-m`; pnpm's virtual store breaks that flag):

```powershell
Set-Location "C:\claude_projects\zengm"
& "$env:USERPROFILE\node_modules\.bin\electron-rebuild.CMD" -f
```

On Linux, install globally (`npm install -g @electron/rebuild`) and run `electron-rebuild -f` from the project root.

### Electron DB path (per-machine setup)

`electron/settings.json` is gitignored. Each machine must create it once:

```json
{
	"dbDir": "/path/to/league/storage/directory"
}
```

Windows Desktop example:

```json
{
	"dbDir": "D:\\Dropbox\\Gaming and Magic and Comics\\ZenGM\\football"
}
```

Each league gets its own file inside `dbDir`: `league-<lid>.db` (lid is a millisecond timestamp).

If `settings.json` is absent, DBs are stored in Electron's `userData` folder (`%APPDATA%\Electron\` on Windows).

### Electron HTTP API (Session 2)

An HTTP API server starts automatically on `http://127.0.0.1:3001` alongside Electron. It uses `win.webContents.executeJavaScript()` to call `window.bbgm.toWorker()` in the renderer -- no preload script or IPC bridge needed.

Override port with `ELECTRON_API_PORT`.

| Method | Path                      | Action                                  |
| ------ | ------------------------- | --------------------------------------- |
| GET    | `/status`                 | Current `{ phase, season }`             |
| POST   | `/sim/day`                | Sim one day                             |
| POST   | `/sim/week`               | Sim one week                            |
| POST   | `/sim/month`              | Sim one month                           |
| POST   | `/sim/untilPlayoffs`      | Sim through regular season              |
| POST   | `/sim/throughPlayoffs`    | Sim through playoffs                    |
| POST   | `/sim/untilDraft`         | Advance to draft phase                  |
| POST   | `/draft/onePick`          | Sim one AI draft pick                   |
| POST   | `/draft/untilEnd`         | Sim rest of draft                       |
| POST   | `/draft/pick`             | User draft pick -- body: `{"pid": 123}` |
| POST   | `/sim/untilResignPlayers` | Advance to resign players               |
| POST   | `/sim/untilFreeAgency`    | Advance to free agency                  |
| POST   | `/sim/untilPreseason`     | Sim through free agency                 |
| POST   | `/sim/untilRegularSeason` | Advance to regular season start         |
| GET    | `/query`                  | SQL (stub -- available in Phase 2)      |

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

## Running Tests

```bash
SPORT=football node --run test
```

---

## Modified Files (from upstream)

### `src/worker/core/GameSim.football/index.ts`

- `coachPlayCall()` replaces `coachSidecarPlayCall()` -- calls TypeScript coach logic directly
- `COACH_PLAY_CALLING = process.env.NODE_ENV !== "test"` -- disabled in tests

### `src/worker/core/GameSim.football/coachDecision.ts` (new)

- `determineMode()`, `playDecision()`, `fourthDownDecision()` -- ported from Python sidecar

### `src/worker/core/game/play.ts`

- Async/await plumbing (retained from sidecar era; `coachPlayCall` is now sync but callers still use await safely)

### `src/worker/api/exhibitionGame.ts`

- Minor async change (retained from sidecar era)

---

## Upstream Reference

Upstream: `https://github.com/zengm-games/zengm`
Branch: `master`

To pull upstream changes manually: `git pull upstream master` (add upstream remote first if needed).
Preferred approach: manual diff review in plan mode (see task 9 / `docs/db_conversion.md`).
