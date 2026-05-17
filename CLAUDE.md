# CLAUDE.md - ZenGM Football (LLM Coach Fork)

This is a fork of [zengm-games/zengm](https://github.com/zengm-games/zengm), modified to replace the hardcoded run/pass math with AI play-calling. Development happens here on the ThinkPad (192.168.1.29). The coach sidecar API is a separate project on the laptop.

---

## What We're Building

ZenGM's `probPass()` math is being replaced with an LLM coach agent. Phase 1 called Groq directly. Phase 2 (complete) calls a standalone coach sidecar running on the LAN.

---

## Phase 1 — Complete (2026-05-01)

- `llmPlayCall()` added to `GameSim.football/index.ts`
- Sent game state to Groq API (`llama-3.1-8b-instant`), got `{ play, reasoning }` back
- Falls back to `probPass()` math on error/timeout/missing key
- 12/12 tests passing (10 unit + 2 integration)
- First ever LLM play call: RUN, 2nd & 7, own 35, tied 14-14, Q3

## Phase 2 — Complete (2026-05-02)

`llmPlayCall()` now POSTs game state JSON directly to a coach sidecar running on the LAN. No Groq API key needed. Sidecar addresses:

- `http://192.168.1.29:3004` — ThinkPad (localhost)
- `http://192.168.1.18:3004` — Windows PC
- `http://192.168.1.142:3004` — Laptop

Set `COACH_SIDECAR_URL` env var to target the right machine. Without it, falls back to `probPass()` math.

---

## Modified Files (6 total)

### `src/worker/core/GameSim.football/index.ts`

Main change. Added at top:

```ts
const LLM_PLAY_CALLING = process.env.NODE_ENV !== "test";
const COACH_SIDECAR_URL = process.env.COACH_SIDECAR_URL
	? process.env.COACH_SIDECAR_URL + "/play"
	: "";
```

`llmPlayCall()` method added at line 618 — POSTs game state JSON to the sidecar, parses `{ play, reasoning }` response, returns `"run"` or `"pass"`. Falls back to math on any error or if `COACH_SIDECAR_URL` is unset.

Around line 968, the original `probPass()` call is now:

```ts
if (LLM_PLAY_CALLING) {
	return await this.llmPlayCall();
}
```

### `src/worker/core/GameSim.football/index.test.ts`

Exports `genTwoTeams` and `initGameSim` helpers so the integration test can reuse them.

### `src/worker/core/GameSim.football/llm.integration.test.ts` _(new file)_

Integration tests that hit the real Groq API. Uses `node:https` directly because `globalThis.fetch` is mocked in the test environment. Tests that `llmPlayCall()` returns `"run"` or `"pass"` for real game scenarios.

### `tools/lib/rolldownConfig.ts`

Added `COACH_SIDECAR_URL` to the `define` block so rolldown bundles it into the worker:

```ts
"process.env.COACH_SIDECAR_URL": JSON.stringify(process.env.COACH_SIDECAR_URL ?? ""),
```

Without this, rolldown turns the missing env var into a build error.

### `src/worker/api/exhibitionGame.ts`

Minor change to support async game simulation needed by `llmPlayCall()`.

### `src/worker/core/game/play.ts`

Minor async/await plumbing change to support the async play-calling path.

---

## Key Gotcha

`llama-3.1-8b-instant` on Groq does **NOT** support `json_schema` response format — returns 400. Always use `json_object` and enforce field names via system prompt wording. The system prompt must end with something like: _"Respond with valid JSON containing exactly two fields: 'play' (either 'run' or 'pass') and 'reasoning' (one sentence)."_

---

## Running the Dev Server

**bash/Linux/Mac:**

```bash
COACH_SIDECAR_URL=http://192.168.1.142:3004 SPORT=football node --run dev
```

**PowerShell:**

```powershell
$env:COACH_SIDECAR_URL="http://192.168.1.142:3004"; $env:SPORT="football"; node --run dev
```

Node 24 (nvm) and pnpm 10 required. Change the IP to whichever machine is running the sidecar.

---

## Running Tests

```bash
# Unit tests only (no sidecar calls)
SPORT=football node --run test

# Integration tests (hits real Groq API — legacy, kept for reference)
GROQ_API_KEY=$GROQ_API_KEY SPORT=football node --run test -- llm.integration
```

---

## Upstream

Upstream repo: `https://github.com/zengm-games/zengm`  
This fork: `https://github.com/MichaelEbbert/zengm`  
Branch: `master`

To pull upstream changes: `git pull upstream master` (add upstream remote first if needed).
