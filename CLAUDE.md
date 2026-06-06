# CLAUDE.md - ZenGM Football (LLM Coach Fork)

This is a fork of [zengm-games/zengm](https://github.com/zengm-games/zengm), modified to replace the hardcoded run/pass math with an AI play-calling coach. Development splits between ThinkPad (Linux, 192.168.1.29) and Windows desktop (192.168.1.18).

---

## Repos Involved

| Repo                | Location                                     | Purpose                        |
| ------------------- | -------------------------------------------- | ------------------------------ |
| `zengm` (this repo) | `/home/michael/claude_projects/zengm/`       | Game engine — TypeScript       |
| `zengm-coach`       | `/home/michael/claude_projects/zengm-coach/` | Coach sidecar — Python FastAPI |

Upstream: `https://github.com/zengm-games/zengm`
Our fork: `https://github.com/MichaelEbbert/zengm`
Coach sidecar: `https://github.com/MichaelEbbert/zengm-coach`

---

## Project State (2026-06-06)

### Phase 1 — COMPLETE (2026-05-01)

- `llmPlayCall()` added to `GameSim.football/index.ts`
- Called Groq API (`llama-3.1-8b-instant`) directly, got `{ play, reasoning }` back
- First ever LLM play call: RUN, 2nd & 7, own 35, tied 14-14, Q3

### Phase 2 — COMPLETE (2026-05-02)

- Replaced direct Groq calls with HTTP sidecar (`zengm-coach`)
- Sidecar started as FastAPI + LLM, evolved into fully deterministic Python (no LLM)
- ZenGM POSTs game state to sidecar per play, gets `"run"` / `"pass"` / `"fieldGoal"` / `"punt"` back

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

## Long-term Vision

The current sidecar is deterministic and LLM-free. That is temporary. The eventual goal is a true AI coach:

```
ZenGM GameSim
    └── POST /play  →  Coach Agent (in-process after task 8)
                           ├── loads coach_profile.md   (personality — immutable, who the coach IS)
                           ├── queries coach_memory.db  (mutable, coach-written — what the coach LEARNED)
                           ├── calls Groq / local Ollama
                           └── returns { play, reasoning }
```

- Each team gets its own coach instance with its own personality and memory DB
- Coach memory is coach-authored: after each game, the LLM writes what it learned back to its SQLite ("they stopped my run on 3rd and short twice — switch to pass in that situation")
- Swap models per coach — Groq for cloud, Ollama for local GPU inference
- Two personalities were tested in Phase 1 (2026-05-01): "default coordinator" and "aggressive first-down coach" — both called PASS on 3rd & 4 down 7 Q4, but reasoning differed noticeably
- Eventual pitch: "pluggable coach API" that anyone could implement and share with the ZenGM community

The deterministic sidecar is a stepping stone — it proves the HTTP interface and game-state payload before adding LLM complexity back in.

---

## Machine Notes

| Machine          | IP            | Notes                                                                                             |
| ---------------- | ------------- | ------------------------------------------------------------------------------------------------- |
| ThinkPad (Linux) | 192.168.1.29  | Primary dev machine                                                                               |
| Windows Desktop  | 192.168.1.18  | NVIDIA 3060/3070; Mistral GGUF installed via Ollama (port 11434) — target for local LLM inference |
| Laptop           | 192.168.1.142 | Sometimes runs the sidecar                                                                        |

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

## Key Gotcha (historical, kept for reference)

`llama-3.1-8b-instant` on Groq does NOT support `json_schema` response format — returns 400. Use `json_object` and enforce field names via system prompt wording. (The sidecar no longer calls any LLM, but if LLM integration resumes, remember this.)

---

## Upstream Reference

Upstream: `https://github.com/zengm-games/zengm`
Branch: `master`

To pull upstream changes manually: `git pull upstream master` (add upstream remote first if needed).
Preferred approach: manual diff review in plan mode (see task 9 / `docs/db_conversion.md`).
