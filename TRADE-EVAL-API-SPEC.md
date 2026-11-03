# Trade Evaluation API — spec for a future enhancement

**Audience:** an AI coding agent working in the `zengm` repo (the Electron fork
of ZenGM Football that this league runs on).
**Author/consumer:** the Claude instance that works in the sibling project
`zengm-press` (a newsroom/GM-assistant project that reads the league SQLite DB
read-only and never writes to `zengm`).
**Status:** implemented 2026-11-02, all of section 5 (`src/worker/api/tradeEval.ts`; usage in `ELECTRON.md`). Section 10: the engine already uses `numBeyond2Other`, so there is nothing to fix. Not done: the UI-parity acceptance tests in section 7 (items 2-3, 5-6) against a real league.

---

## 1. Why this exists

The human GM (Michael, user team `tid = 28`, Los Angeles Rams) makes trades
through the in-game UI. He uses the trading block, and occasionally the trade
screen with "What would make this deal work?". He pastes each offer into the
`zengm-press` session, and that assistant evaluates it.

Today the assistant can only **approximate** the AI's trade logic. It reads
`src/worker/core/team/valueChange.ts` and friends, then recomputes values from
the SQLite DB in Python. That approximation is wrong in ways that matter:

- **Draft pick values** depend on `getEstPicks` (team-OVR rank blended with
  record), `trade.getPickValues()` (current prospect pool), the user-pick
  penalty and AI-pick bonus in `getPickNumber`, and the "more than 2 picks"
  multiplier. The assistant can't reproduce these reliably.
- **Unexplained rejections.** In one real case, a rebuilding AI team rejected
  adding a player the assistant's math said was a clear positive for them.
  There's no way to see why from outside the worker.
- **No iteration.** Every "what if we swap X for Y" costs a round trip through
  the human and the UI.

The goal is a **read-only** local HTTP API. Given a hypothetical trade, it
returns exactly what the engine would decide and why, plus search helpers built
on the same functions. The assistant would call it with `curl` from its shell.

---

## 2. Hard requirements

1. **Strictly read-only.** No endpoint may change league state, in memory or on
   disk. Specifically, it must NOT:
   - write `idb.cache.trade` (the user's open negotiation). Do **not** call
     `trade.create`, `trade.updatePlayers`, `trade.clear`, `trade.propose`,
     `trade.processTrade` or `makeItWorkTrade`. `makeItWorkTrade` writes
     `idb.cache.trade.put(...)`.
   - write `idb.cache.savedTrades`.
   - save trading-block "looking for" state. `api.getTradingBlockOffers` does
     this (`saveLookingFor`), so call the inner `getOffers` logic instead.
   - call `logEvent`, `toUI(...)` state updates, `league.setGameAttributes`, or
     anything that triggers a player/team flush to SQLite. Note the Electron
     fork has `POST /players/flush` and `POST /game` routes. Nothing here may
     cause them to fire.
   - mutate any object fetched from `idb.cache` without `helpers.deepCopy`
     first. Several trade helpers mutate their `teams` argument in place.
2. **Local only.** Bind to `127.0.0.1` only, which the existing server already
   does. No auth is needed.
3. **Reuse the engine's own functions**, not reimplementations. Wherever this
   spec needs internals (per-asset values), refactor the engine function to
   expose them through an optional return path, and keep existing call sites
   and return types unchanged.
4. **Deterministic within a request.** `team.valueChange` caches estimated pick
   values per `valueChangeKey`. Use one fixed key for every evaluation inside a
   single request (especially batch/search), and a fresh `Math.random()` key
   per request so the cache refreshes against current rosters.
5. **Refuse while a sim is running.** If `lock.get("gameSim")` is true (or any
   other worker lock is held), return HTTP 409 `{ "error": "busy" }`.

---

## 3. Where it plugs in (existing infrastructure)

`electron/main.js` already runs a local HTTP server:

- `startApiServer(win)`, listening on `127.0.0.1:${ELECTRON_API_PORT ?? 3001}`
- `callWorker(win, type, name, param)` runs
  `window.bbgm.toWorker(type, name, param)` via `webContents.executeJavaScript`
  and awaits the promise
- routes are matched by `"METHOD /path"` keys, JSON in and out, CORS `*`

**Plan:**

- Add new worker API functions in `src/worker/api/index.ts` (and register them
  in the exported `api` object near `getTradingBlockOffers`). Suggested names
  are listed per endpoint below. All live under a `tradeEval*` prefix to make
  them easy to find and audit for read-only safety.
- Add the matching routes in `startApiServer` with `callWorker(win, "main",
"<name>", body)`.
- Parse JSON bodies the same way the existing `POST /draft/pick` route does.

There's also a generic `POST /debug/eval` passthrough to `evalOnWorker`. It's
marked temporary and runs arbitrary code. Don't build on it, and the assistant
won't use it.

---

## 4. Shared types (response shapes)

TypeScript-ish. All money is in **thousands of dollars**, matching
`contract.amount`, unless a field name ends in `M`.

```ts
type TradeSide = {
	tid: number;
	pids: number[]; // players this team SENDS
	dpids: number[]; // draft picks this team SENDS
};

// Request form of a trade: exactly two sides.
// Convention: sides[0] is the user team (tid 28) unless "perspectiveTid" says otherwise.
type TradeRequest = {
	sides: [TradeSide, TradeSide];
};

type AssetBreakdown = {
	kind: "player" | "pick";
	// player fields
	pid?: number;
	name?: string;
	pos?: string;
	age?: number;
	ovr?: number; // true
	pot?: number; // true
	ovrFuzzed?: number; // what the user sees in the UI (player.fuzzRating with ratings.fuzz)
	potFuzzed?: number;
	pValue?: number; // p.value (unfuzzed), the input to zscore
	contract?: { amount: number; exp: number };
	injury?: { type: string; gamesRemaining: number };
	// pick fields
	dpid?: number;
	season?: number | "fantasy" | "expansion";
	round?: number;
	originalTid?: number;
	estPick?: number; // after user-penalty / AI-bonus adjustments in getPickNumber
	// valuation internals, from the evaluating team's perspective
	zValue: number; // zscore(p.value) or the pick's zscore'd est value, after the 0.1 floor for picks
	fudgedValue?: number; // after fudgeFactor (only applies to the evaluating team's removed assets)
	contractValue: number; // getContractValue(...) result (capped at 0.1; 0 for expiring)
	strategyFactor: number; // age/pick multiplier applied in sumValues for this team's strategy
	injuryAdjustment?: number;
	justDrafted: boolean;
	afterNegativeScaling: number; // playerValue after the "/20 if negative" rule
	contractsFactor: number; // 2 for rebuilding, 0.5 otherwise
	finalValue: number; // playerValue + contractsFactor * contractValue, after justDrafted clamp
	contribution: number; // finalValue > 1 ? finalValue ** EXPONENT : finalValue
	manyPicksMultiplier?: number; // from the "more than 2 picks" rule, if applied
	untradable: boolean;
	untradableMsg?: string; // from trade/isUntradable.ts
};

type TeamValuation = {
	tid: number;
	abbrev: string;
	strategy: "contending" | "rebuilding" | string;
	add: AssetBreakdown[]; // what this team receives
	remove: AssetBreakdown[]; // what this team sends
	sumAdd: number;
	sumRemove: number;
	dv: number; // sumAdd - sumRemove, identical to team.valueChange(...)
};

type CapCheck = {
	salaryCap: number;
	salaryCapType: "hard" | "soft" | "none";
	teams: [
		{
			tid: number;
			payrollBefore: number;
			payrollAfter: number;
			overCapAfter: boolean;
			payrollIncreases: boolean;
		},
		{
			tid: number;
			payrollBefore: number;
			payrollAfter: number;
			overCapAfter: boolean;
			payrollIncreases: boolean;
		},
	];
	warning: string | null; // exactly trade.summary(teams).warning
	warningAmount?: number;
	rule: "ok" | "hardCapOverAndIncreasing" | "softCapSalaryMatch";
};

type RosterCheck = {
	maxRosterSize: number;
	minRosterSize: number;
	teams: [
		{ tid: number; before: number; after: number },
		{ tid: number; before: number; after: number },
	];
	// informational only; the trade code does not enforce roster size
};

type TeamOvrDelta = {
	tid: number;
	before: number; // team.ovr(...) on current roster, same number the trade screen shows
	after: number;
};

type EvaluateResult = {
	tradesAllowedNow: boolean; // false between AFTER_TRADE_DEADLINE and PLAYOFFS (see propose.ts)
	phase: number;
	season: number;
	valueChangeKey: number;
	aiTid: number; // the side whose acceptance is being judged
	aiValuation: TeamValuation; // the AI side's view (this is what decides accept/reject)
	userValuation?: TeamValuation; // the same math from the other side's perspective, informational
	cap: CapCheck;
	roster: RosterCheck;
	teamOvr: [TeamOvrDelta, TeamOvrDelta];
	wouldAccept: boolean; // tradesAllowedNow && !cap.warning && no untradable asset && aiValuation.dv > 0
	rejectionMessage: string | null; // same buckets as propose.ts: dv > -2 "Close...", > -5 "not a good deal", else "crazy"
	blockers: string[]; // human-readable reasons wouldAccept is false
};
```

---

## 5. Endpoints

### 5.1 `GET /trade/context`

**Worker fn:** `tradeEvalContext()`

Returns the global inputs that drive valuation, so the consumer can sanity-check
its own math:

```json
{
	"season": 2003,
	"phase": 0,
	"daysLeft": 0,
	"userTid": 28,
	"numActiveTeams": 32,
	"numDraftRounds": 7,
	"salaryCap": 200000,
	"salaryCapType": "hard",
	"minContract": 500,
	"maxContract": 30000,
	"maxRosterSize": 55,
	"minRosterSize": 40,
	"difficulty": 0,
	"playerOvrMean": 47.82,
	"playerOvrStd": 11.47,
	"exponent": 3,
	"tradesAllowedNow": true,
	"teams": [
		{
			"tid": 0,
			"abbrev": "...",
			"strategy": "rebuilding",
			"payroll": 0,
			"capSpace": 0,
			"rosterSize": 0,
			"teamOvr": 0,
			"estPick": 0
		}
	]
}
```

- `playerOvrMean`/`Std`: call `player.updateOvrMeanStd()`, then read
  `local.playerOvrMean` / `local.playerOvrStd`. Note these are computed from
  **ovr**, not value, over players with `tid >= FREE_AGENT`.
- `payroll`: `team.getPayroll(tid)`, which includes released players.
- `estPick`: from the same `getEstPicks` the valuation uses (the cached
  `estPicks` for the current `valueChangeKey`). The UI never shows this, and it
  drives every pick value.

### 5.2 `POST /trade/evaluate`

**Worker fn:** `tradeEvalEvaluate({ sides, perspectiveTid?, valueChangeKey? })`

The core endpoint. It does exactly what `trade.propose(false)` would decide,
without proposing.

**Request:**

```json
{
	"sides": [
		{ "tid": 28, "pids": [123, 456], "dpids": [] },
		{ "tid": 19, "pids": [789], "dpids": [1011] }
	]
}
```

**Logic:**

1. Build a `TradeTeams` value with `pidsExcluded: []` and `dpidsExcluded: []`.
   Validate that each pid currently belongs to the stated `tid`, and each dpid
   is owned by it (`dp.tid`). Return 400 with the offending ids otherwise.
2. `s = await trade.summary(teams)`. That gives the cap warning and payrolls.
3. AI side = the side whose `tid !== userTid` (or `perspectiveTid` if given).
   `dv = await team.valueChange(aiTid, pidsAdd, pidsRemove, dpidsAdd,
dpidsRemove, key, userTid)`, with the same argument order as
   `propose.ts`: the AI adds what the user sends and removes what it sends.
4. For the breakdown, refactor `valueChange` into an internal
   `valueChangeDetailed(...)` that returns `{ dv, add, remove, sumAdd,
sumRemove }` with the per-asset intermediate numbers listed in
   `AssetBreakdown`. Then `valueChange` = `(await valueChangeDetailed(...)).dv`.
   **Must be bit-for-bit identical** to the current return value. Add a unit
   test comparing both on random trades.
5. `isUntradable(p)` for every player asset.
6. `team.ovr` before/after for both teams. This is the same number the trade
   screen shows ("Team ovr: 59 → 60"). Find where the trade UI computes it
   (the trade summary view) and reuse that.
7. Roster counts before/after (`playersByTid` counts).
8. `wouldAccept` and `blockers`, built from all of the above.

Also return `userValuation`: the same detailed valuation from the user team's
side, with `tradingPartnerTid = aiTid`. It's informational, and lets the
consumer see how the engine would value the deal for the Rams if the Rams were
AI-controlled.

### 5.3 `POST /trade/evaluate/batch`

**Worker fn:** `tradeEvalBatch({ trades: TradeRequest[], perspectiveTid? })`

- Up to **500** trades per call.
- Generate ONE `valueChangeKey` for the whole batch and reuse it. That keeps
  every result consistent and makes the batch fast, since estimated pick values
  are cached per key.
- Returns `EvaluateResult[]` in input order. Option `compact: true` drops the
  per-asset breakdowns and returns only `{ wouldAccept, dv, cap.warning,
teamOvr, blockers }`.

### 5.4 `POST /trade/makeItWork`

**Worker fn:** `tradeEvalMakeItWork({ sides, holdUserConstant, maxAssetsToAdd?, lookingFor?, excludePids?, excludeDpids?, maxIncomingSalary? })`

The in-game "What would make this deal work?" button, without writing the
negotiation, and with constraints the UI lacks.

- Build `TradeTeams` from `sides`. Put `excludePids`/`excludeDpids` into the
  user side's `pidsExcluded`/`dpidsExcluded`. Those fields already exist on
  `TradeTeam`, and `makeItWork` respects them when choosing assets to add.
  These are the **untouchables**, e.g. the GM's core DL.
- Call `trade.makeItWork(helpers.deepCopy(teams), { holdUserConstant,
maxAssetsToAdd, lookingFor, valueChangeKey })`.
  - `holdUserConstant: false` = the AI asks for more of the user's assets
    (what the UI button does).
  - `holdUserConstant: true` = the AI adds its own assets to balance (what
    trading-block offers do).
- If `maxIncomingSalary` is set, post-filter: if the result exceeds it,
  re-run with the offending AI-added asset excluded (loop up to N=10 times).
  Or implement it as a constraint inside a copy of `tryAddAsset`, whichever is
  cleaner.
- Return `{ found: boolean, sides: [TradeSide, TradeSide], evaluation:
EvaluateResult }`. If `makeItWork` returns `false`, respond with `found:
false` and the UI's message ("I can't afford to give up so much").

### 5.5 `POST /trade/blockOffers`

**Worker fn:** `tradeEvalBlockOffers({ pids, dpids, lookingFor })`

The trading block, without saving `lookingFor` and with each offer fully
evaluated.

- Reuse the body of `getOffers(userPids, userDpids, lookingFor)` in
  `src/worker/api/index.ts`, but not `getTradingBlockOffers`, which persists
  state. If `getOffers` turns out to have side effects, copy its loop.
- For each offer, attach `EvaluateResult`, ideally from one batch key.
- **Flag cap-illegal offers.** Block offers are built by `makeItWork`, which
  never runs `trade.summary`, so offers that would put either team over the
  hard cap show up in the UI. This has happened in this league. Include
  `cap.warning` per offer and a top-level `legalOffers` count.
- `lookingFor` accepts the same concise shape `toConciseLookingFor` produces,
  plus a convenience form `{ "positions": ["QB"], "draftPicks": false,
"prospects": false, "bestCurrentPlayers": false }`.

### 5.6 `POST /trade/search`

**Worker fn:** `tradeEvalSearch({...})`

This is the most valuable endpoint. It finds the cheapest user packages that
the AI accepts for a target.

**Request:**

```json
{
	"aiTid": 13,
	"aiPids": [555], // what the user wants (e.g. a target QB)
	"aiDpids": [],
	"aiOptionalPids": [556], // AI assets the search may also take back (e.g. salary filler) - optional
	"userCandidatePids": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
	"userCandidateDpids": [201, 202],
	"userMustInclude": [],
	"maxUserAssets": 5,
	"requireCapLegal": true,
	"maxResults": 25,
	"sortBy": ["userTeamOvrLoss", "userOutgoingValue", "dvMargin"]
}
```

**Logic:**

- Enumerate subsets of `userCandidatePids ∪ userCandidateDpids` up to
  `maxUserAssets` (plus each subset of `aiOptionalPids`, if given). Always
  include `userMustInclude`.
- Evaluate each with the batch machinery (one key).
- Keep those with `wouldAccept === true` (and cap-legal if
  `requireCapLegal`).
- Score each from the **user's** perspective:
  - `userTeamOvrLoss` = user team.ovr before minus after, the same calculation
    as 5.2 step 6
  - `userOutgoingValue` = sum of the user's sent assets' `contribution` values,
    as the user team's own valuation would see them
  - `dvMargin` = AI `dv` (smaller positive = less overpay)
- Return the top `maxResults`, each with a compact evaluation.

**Limits:** cap evaluations at ~20,000 per request. With 15 candidates and
`maxUserAssets = 5` that's ~4,900 subsets, so this is fine. Return
`{ truncated: true }` if a request would exceed the cap. Optional pruning:
first evaluate singletons and drop candidates whose `contribution` to the AI
is ≤ 0 when the deficit is large. Leave that as a later optimization; correct
first.

### 5.7 `GET /player/:pid/tradeValue?perspectiveTid=<tid>`

**Worker fn:** `tradeEvalPlayerValue({ pid, perspectiveTid })`

One `AssetBreakdown` for the player as `perspectiveTid` would value receiving
him (`add` path, with injuries included). Defaults to every AI team's
strategy class, returning both `contending` and `rebuilding` numbers. Also
includes `isUntradable`.

### 5.8 `GET /draftPick/:dpid/value?perspectiveTid=<tid>`

**Worker fn:** `tradeEvalPickValue({ dpid, perspectiveTid })`

Returns `estPick` before and after the user-penalty/AI-bonus adjustment in
`getPickNumber`, the raw `estValues[season][estPick-1]`, the z-scored value,
the 0.1 floor, the rookie-salary `contractValue`, and the final value. This is
the piece the consumer can't reconstruct today.

### 5.9 `GET /team/:tid/capStatus`

**Worker fn:** `tradeEvalCapStatus({ tid })`

`{ payroll, capSpace, releasedPlayersSalary, rosterSize, strategy, teamOvr,
estPick }`. Lets the consumer check "can the other team absorb this salary"
quickly.

---

## 6. Valuation facts the implementation must preserve

The consumer has relied on these (from reading the source). The breakdown
fields should make each one visible:

- `zscore(p.value)` uses the mean/std of **ovr** across all players with
  `tid >= -1` (`player/updateOvrMeanStd.ts`).
- Negative player values are divided by 20 (`sumValues`), so below-average
  players are tiny negatives.
- `contractValue`: 0 for contracts expiring this season (and, after the
  playoffs, next season). Otherwise
  `slope * (z - MIN_VALUE) - amount / salaryCap`, capped at 0.1 and weighted
  by `contractsFactor` (2 rebuilding, 0.5 otherwise).
- Strategy age multipliers (rebuilding favors ≤ 23, penalizes ≥ 27;
  contending discounts ≤ 24) apply to the value **before** the contract term.
- Values > 1 are raised to `EXPONENT` (3 for football). This is why one strong
  asset outweighs several moderate ones.
- Draft picks are floored at 0.1 (`getPickInfo`: "rookies can be cut"), so any
  pick is a small positive sweetener.
- User picks get `estPick += numPicksPerRound/3.5` (times the difficulty
  factor). AI picks get `estPick -= numPicksPerRound/3.5`.
- `fudgeFactor` only multiplies the evaluating team's **removed positive**
  assets. It's `1.05` for AI-AI trades, times `1 + 0.1*difficulty`.
- Injured incoming players are discounted (`includeInjuries` on the `add`
  side only, and only for non-user teams).
- K/P values are scaled 0.7 inside `player/value.ts`, before any of this.
- Position need and depth chart are **not** considered anywhere.

---

## 7. Acceptance tests

Run against a copy of league `1786126806602` (or any league). For each, assert
the API matches what the UI does.

1. **No-op safety.** Snapshot `idb.cache.trade`, `idb.cache.savedTrades`, the
   trading-block looking-for state, `events` count, and the league SQLite file's
   mtime and size. Call every endpoint 100 times. Re-snapshot: all identical.
2. **Parity with propose.** For 200 random two-team trades, `evaluate.dv` ==
   `team.valueChange(...)` called the way `propose.ts` calls it, and
   `wouldAccept` == what `propose(false)` would return (verify on a throwaway
   copy of the league).
3. **Parity with the UI's "What would make this work?".** `makeItWork` with
   `holdUserConstant: false` and the same random seed/key reproduces the UI's
   proposal.
4. **Cap rule.** A trade that leaves the user over $200M with payroll
   increasing returns `cap.rule = "hardCapOverAndIncreasing"` and
   `wouldAccept: false`. One that ends over the cap but with payroll
   decreasing is allowed.
5. **Known real cases from this league** (they should come out the way they
   did in the UI):
   - a below-average player offered alone for nothing → rejected ("Close, but
     not quite good enough")
   - the same player plus any draft pick → accepted (the pick floor of 0.1)
   - an expiring-contract player during RESIGN_PLAYERS → `untradable: true`
     with "Cannot trade expired contracts"
6. **Search sanity.** For a target the UI says costs exactly one specific
   package, `/trade/search` lists that package (or a cheaper accepted one) in
   its results.

---

## 8. Example usage (how the consumer will call it)

The ids below are illustrative, not current.

```bash
# What does Indianapolis think of this exact package?
curl -s -X POST http://127.0.0.1:3001/trade/evaluate \
  -H 'Content-Type: application/json' \
  -d '{"sides":[{"tid":28,"pids":[809,1203],"dpids":[]},{"tid":13,"pids":[555],"dpids":[]}]}'

# Cheapest packages for QB pid 555, never touching the DL:
curl -s -X POST http://127.0.0.1:3001/trade/search \
  -H 'Content-Type: application/json' \
  -d '{"aiTid":13,"aiPids":[555],"userCandidatePids":[809,87,958,578,2682,2549],"maxUserAssets":4,"requireCapLegal":true}'

# Value of our 2005 1st to a rebuilding team:
curl -s "http://127.0.0.1:3001/draftPick/668/value?perspectiveTid=29"
```

---

## 9. Out of scope (for now)

- Executing or proposing trades through the API. If ever added, it must be a
  separate, clearly named route that's off by default.
- AI-to-AI trade simulation (`betweenAiTeams.ts`).
- Free-agent contract evaluation (`generateContractOptions`, mood). That's a
  possible follow-up with the same read-only rules. The consumer would value a
  `POST /freeAgent/contractOptions { pid }` that returns
  `generateContractOptions` output plus `moodInfo` without starting a
  negotiation.

---

## 10. Possible upstream bug noticed while reading (for the engine AI to check)

In `src/worker/core/team/valueChange.ts`, `getPicks`, the "less extreme"
multiplier for non-first-round picks uses `numBeyond2` (the **first-round**
count) instead of `numBeyond2Other`:

```ts
const numBeyond2Other = otherPicks.length - 2;
if (numBeyond2Other > 0) {
	for (const pick of otherPicks) {
		if (pick.value > 0) {
			pick.value *= 1 + numBeyond2 / (SPORT_FACTOR * pick.dp.round); // <- numBeyond2Other?
		}
	}
}
```

When a team gives up 3+ non-first-round picks but ≤ 2 firsts, `numBeyond2` is
≤ 0, so the multiplier is ≤ 1, and with 0–1 firsts it actually **shrinks** the
pick values. That's probably not intended. This only affects how much the AI
values giving up several later picks. Worth confirming against upstream ZenGM
before changing anything. The API's breakdown (`manyPicksMultiplier`) should
report whatever the code actually does.
