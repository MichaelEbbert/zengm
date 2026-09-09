# ELECTRON.md - ZenGM Football (Coach Fork)

Electron runtime setup, native module rebuilds, DB path config, and the HTTP API — moved out of `CLAUDE.md` since it's only needed when doing Electron-specific work, not every session.

---

## Running in Electron

Start the dev server in one terminal (see `CLAUDE.md` for the command), then in a second terminal:

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
