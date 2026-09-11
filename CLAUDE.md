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

## Resume Checkpoint (2026-09-11)

**The "new clock" (`docs/clock_play_pacing.md`) shipped 2026-09-11, tagged `pre-2002-daily-league-season`.** Production config **K** in `playClock.ts`: penalties stop the clock inside the late windows, hurry-up out of bounds 52% / 17%, dead time 31.5 / 23.5 / 23.5 / 15.5s, hurry-up play length 4.5s center / 3s floor (normal plays in hurry-up only), and timeouts only while the clock runs. The doc's "Config K -- production" section is the harness before/after (plays 63.1 -> 63.8, points 23.84 -> 23.82, 11-40s gaps 2% -> 55%, comebacks ~1 point up); "League validation" is the TEST_LEAGUE_1 season 2030 check. Shipped with it: the early 1st-down pass tweak in `coachDecision.ts` (`EARLY_FIRST_DOWN_PASS_RATE` 0.25 before the 5-and-5 ratio threshold), the harness `offenseReport`, and a "went out of bounds" play-by-play line. Offered, not started: change-of-possession dead time vs the NFL's snap restart, trailing-team tempo before 2:00, and the `formatClock` 1:59 display quirk. The before-baseline worktree `C:\claude_projects\zengm-baseline` can be deleted -- `node_modules` there is a junction to this repo's, so `rmdir` the junction first or it takes this repo's `node_modules` with it.

Where things stand:

- **The problem:** time between snaps is bimodal -- 62% of non-hurry-up gaps are 0-10s, 36% are 41-70s, and only ~2% fall in the realistic 11-40s band.
- **Leading plan:** the "Leading plan" section of `docs/clock_play_pacing.md`, three parts: (1) a new live-action play-length distribution (floor 4s, max 12s, mean 6s; 97% Gaussian 5.8/1 redrawn below 4, 3% big plays uniform 10-12s tied to the play's result); (2) lower out-of-bounds rates, runs 15% -> ~6-7%, completions 25% -> ~20%; (3) a dead-time table by how the play ended -- in bounds ~32s clipped 24-39s, out of bounds ~24s except 0s inside the late windows (last 2:00 of the first half, last 5:00 of the game), changes of possession as out of bounds. Hurry-up joins the model gently, with before/after harness tests so comebacks survive. All earlier candidate fixes were dropped in its favor.
- **Baseline measured:** the "Harness baseline v3" section of the same doc -- 1,000 games of Goin Fast's LAC (team ovr 63) vs BUF (44), real rosters (plays per team-game, the gap histogram, points/drives, late-half points, clock stops by cause), plus 12 comeback scenarios x 2,000 replays with each team trailing. Scoring matches the real league (23.5 pts per team-game, 2.0 per drive). Re-measure any change with `-t "clock distribution"` and `-t "comeback"` (see "Sim harness" below) and compare against it.
- **Earlier harness numbers are void.** Until 2026-09-10 every harness depth chart was empty (ratings dated 2016 vs the harness season 2013), so the sim fielded players in roster order -- cornerbacks at QB. The coach vs stock, head-to-head and 4th-and-2 results, and the v1/v2 baselines, all came from that; rerun before relying on any of them.
- **Built:** `GameSim.football/playClock.ts` holds every clock table -- `PLAY_LENGTH`, `BIG_PLAY_YARDS`, `OUT_OF_BOUNDS_RATE`, `HURRY_UP_OUT_OF_BOUNDS_RATE`, `DEAD_TIME`, `LATE_WINDOW_MINUTES` -- plus `playOutcome`/`playLength` and `deadTimeCase`/`deadTime`. `simPlay` (`index.ts`) draws one play length per play and one dead time per play from them; `Play.ts` gained `State.outOfBounds`, `Play.penaltyEnforced` and `Play.hurryUp`. Tests: `playClock.test.ts`, the "out-of-bounds clock stops" block in `Play.test.ts`, and the harness play-time / dead-time tests.
- **Tuning runs without editing source:** `SIM_TUNE='{"DEAD_TIME":{"penalty":{"mean":14,"min":6,"max":21}}}'` on the "clock distribution" / "comeback" experiments overrides the tables for that run, so configs run side by side. A comparison script lives in the session scratchpad (`compare.js`) -- rewrite it if the scratchpad is gone.

---

## Future Plans

See `FUTURE_PLANS.md` for planned and in-progress work items (DB conversion history, preseason games, upstream sync, desperation mode tuning, etc.). Read it if the user starts talking about between-season changes, upcoming features, or "what's next."

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

## Running in Electron

Start the dev server first (see above), then `node --run electron` in a second terminal.

See `ELECTRON.md` for: native module (better-sqlite3) ABI rebuilds, per-machine `settings.json` DB path setup, and the full HTTP API reference (endpoints, port, example scripts).

---

## Running Tests

```bash
SPORT=football node --run test
```

### Sim harness (throwaway games for experiments)

`src/worker/core/GameSim.football/simHarness.ts` sims any number of games between two generated teams in the test cache -- nothing persisted, no Electron, ~30ms/game. `simGames({ n, coach })` runs with the coach play-calling on or off -- `coach: true/false` for both teams, or `[team0, team1]` for head-to-head, which alternates sides every game so roster differences cancel; `setPosition(tid, pos, specs)` pins exact ratings (`[80, 70, 60, 50, 40, 40, 40]` for OL ovrs, or `{ ratings: { ppw: 99, pac: 39 } }` for raw ratings). Every snap is recorded with its outcome, the game-clock gap to the next snap, and whether that gap used hurry-up pacing. `clockReport()` gives plays per team-game and a 5-second histogram of non-hurry-up gaps -- the baseline to compare against when changing clock timing.

`simFromState({ n, coach, state })` replays one situation `n` times -- down, distance, `scrimmage` (opp 20 = 80), `clock` in minutes (0:09 = 0.15), quarter, score `diff` and timeouts -- and sims to the end of the period. It reports the first-snap call distribution, win/tie/loss (a 4th-quarter tie stays a tie, no overtime), and points for/against.

Set up the scenario in the experiment test in `simHarness.test.ts`, then:

```bash
SIM_HARNESS=1 SIM_GAMES=200 SPORT=football npx vitest run --project football src/worker/core/GameSim.football/simHarness.test.ts -t experiment
```

`genHarnessTeams({ seed })` builds the same two generated rosters every run (the games stay random); `genHarnessTeams({ rosters })` loads real rosters instead -- `harnessRosters/goinFast1921.json` holds Goin Fast's LAC (team ovr 63) and BUF (44), exported from the league DB with raw ratings, and the clock experiments play them so before/after runs use the same teams. `teamOvr(tid)` gives the game's team ovr. Each snap also records points scored, whether it started a drive, and why the clock stopped (`stop`, one of `STOP_CAUSES`); `gameReport()` turns that into points/drives per team-game, hurry-up snaps and late-half points per game, and clock stops per game by cause. `simFromState` also reports how the opening drive ended (TD / FG / neither).

`-t "coach vs stock"`, `-t "head-to-head,"`, `-t "4th and 2"`, `-t "clock distribution"` or `-t "comeback"` (`SIM_TRIALS` replays per situation) runs one experiment; `-t experiment` runs all of them. `summarize()` also splits points, win/tie/loss, pass rate and INT rate by each side's play-calling.

`SIM_OUT=<path>` also writes the summaries as JSON. With the LAC vs BUF rosters the harness matches the real league (23.5 pts and 63 offensive plays per team-game vs 23-25 and ~60); still, lean on before/after deltas rather than absolute levels.

---

## Modified Files (from upstream)

### `src/worker/core/GameSim.football/index.ts`

- `coachPlayCall()` replaces `coachSidecarPlayCall()` -- calls TypeScript coach logic directly
- `COACH_PLAY_CALLING = process.env.NODE_ENV !== "test"` -- disabled in tests
- `coachPlayCalling: [boolean, boolean]` instance field, one per team (both default to `COACH_PLAY_CALLING`) -- `getPlayType()` reads `this.coachPlayCalling[this.o]` at both play-call sites, so the sim harness can run coach vs stock, including head-to-head in one game

### `src/worker/core/GameSim.football/coachDecision.ts` (new)

- `determineMode()`, `playDecision()`, `fourthDownDecision()` -- ported from Python sidecar

### `src/worker/core/game/play.ts`

- Async/await plumbing (retained from sidecar era; `coachPlayCall` is now sync but callers still use await safely)

### `src/worker/api/exhibitionGame.ts`

- Minor async change (retained from sidecar era)

---

## Pass Defense Rating Priorities (from `GameSim.football/index.ts` analysis)

- Priority to LOWER completion %: CB pcv/spd first, then S pcv/spd/hgt, then DL prs/stre/spd/hgt (and secondarily LB in both roles).
- Priority to LOWER yards/catch: DL prs, stre, spd, hgt — LB same ratings secondarily. Your secondary's coverage skill won't shrink YAC.

## Sack Prevention Rating Priorities (from `probSack` in `GameSim.football/index.ts`)

- `probSack = (0.06 * defense.passRushing) / (0.5 * (QB.avoidingSacks + offense.passBlocking)) * sackFactor` — QB avoidingSacks and team passBlocking are additive and equally weighted, so gains on either side are interchangeable.
- Priority to raise team passBlocking: OL pbk/stre first (weight 3 in composite), then TE pbk/stre (weight 2), then RB pbk/stre (weight 1). hgt is half-weight, spd barely matters.
- Priority to raise QB avoidingSacks: thv and elu equally (weight 1 each), stre is a quarter-weight tiebreaker.

## Fumble Rating Priorities (from `probFumble` in `GameSim.football/index.ts`)

- `probFumble(p) = 0.0125 * (1.5 - p.ballSecurity) * fumbleFactor * (defense.tackling / 0.56) ** 2` — blocking (passBlocking/runBlocking) has no effect on fumbles at all.
- To protect the ball: raise `bsc`/`stre` (ballSecurity) on whoever's carrying — RB on runs, WR/TE/RB after a catch, QB on a sack, KR/PR on returns.
- To force fumbles on defense: raise DL/LB/S `tck` (tackling composite) — the defense's tackling term is squared, so it has an outsized effect vs. every other rating in the sim.

## Run Defense Rating Priorities (from the rushing `meanYds` formula in `GameSim.football/index.ts`)

- `meanYds = scrambleModifier * 1.75 * (offense.rushing + offense.runBlocking) / defense.runStopping` — defense's runStopping composite sits in the denominator un-squared, so it's directly (not exponentially) proportional: a 10% gain in team runStopping cuts expected rush yards ~10%. Individual run-block "win" rolls (OL/TE/RB vs. runStopping) only drive box-score/announcer stats, not the yardage itself.
- Priority to raise team runStopping: DL/LB/S `rns` and `stre` first (weight 1 each in the per-player composite), then `tck` (weight 0.4), with `hgt`/`spd` as half-weight tiebreakers.
- The per-play composite is drawn from DL/LB/S on the field, sorted by DL ovr and weighted most heavily toward the top two (weights 5, 4, then 3, 2, 2, 1, 1) — upgrading your best down-linemen and starting LBs matters far more than upgrading a third safety.

---

## Punter Rating Priorities (from `punt()` in `GameSim.football/index.ts`)

**The raw ratings did not change — punters still have exactly `ppw` and `pac`.** What changed is the composite layer above them: the single `punting` composite (`["ppw","pac"]`, weights `[1,1]`) was split into two independent composites.

```
adjustment      = (puntingPower - 0.7) * 20
averageDistance = 50 + adjustment
distance        = truncGauss(averageDistance, 8, 25, 90)
if (scrimmage + distance >= 100 && random < puntingAccuracy ** 1.5 * 0.95) {
    target   = randInt(99, max(81, scrimmage))   // yard lines 82-99
    distance = target - scrimmage
}
```

- **`ppw` → `puntingPower` → distance, and nothing else.** Baseline average is 50 yards (was 44), moved +/-20 yards across the full rating range.
- **`pac` → `puntingAccuracy` → touchback avoidance, and nothing else.** It only matters on punts that would otherwise reach the end zone. When the roll passes, the ball is downed between the opponent's 18 and their 1.
- **Accuracy pays off non-linearly** (`pac ** 1.5 * 0.95`): 0.5 converts ~34% of those attempts, 0.8 ~68%, 1.0 95%. The top of the rating range is worth disproportionately more than the middle.

**Punter ovr is unchanged.** `player/ovr.football.ts` went `punting: [1, 1]` → `puntingPower: [1, 1], puntingAccuracy: [1, 1]` — the same shape the kicker already used — and the old composite was a 50/50 blend of the same two ratings, so the arithmetic lands in the same place.

**Consequence for evaluation: ovr no longer tells you what kind of punter you have.** Two punters at the same ovr play very differently depending on the split. Before this change `pac` was averaged into `punting` and then used only for distance, so accuracy just made the leg look stronger; it now drives a separate mechanic. Judge a punter on `ppw` and `pac` separately, and check `pntIn20Pct` / `pntTBPct` on the depth chart rather than the composite.

## Roster Philosophy: The First Man Out Is a Starter

**Team goal: field a team that performs steadily all year, not one that peaks on paper.** Team ovr measures the paper team. Build past it.

`team/ovr.football.ts` scores a fixed number of slots per position. `GameSim.football/formations.ts` puts a different number on the field. Where they disagree, the game is right and the ovr number is wrong:

| Pos | On field (3 `normal` formations) | Counted by ovr | Verdict                   |
| --- | -------------------------------- | -------------- | ------------------------- |
| RB  | 1 / **2** / **2**                | 1              | RB2 is a starter          |
| TE  | 1 / 1 / **2**                    | 1              | TE2 is a starter          |
| LB  | 2 / **4** / **3**                | 2              | LB3 and LB4 are starters  |
| CB  | **3** / 2 / 2                    | 2              | CB3 is a starter (nickel) |
| DL  | 4 / 3 / 4                        | 4              | DL5 is true depth         |
| S   | 2 / 2 / 2                        | 2              | S3 is true depth          |
| WR  | 3 / 2 / 1                        | 3              | WR4 is true depth         |
| OL  | 5 / 5 / 5                        | 5              | OL6 is true depth         |

Consequences:

- **Pay RB2, TE2, LB3, LB4 and CB3 like starters.** They take formation snaps every game and contribute nothing to the displayed ovr. A roster that looks "efficient" by ovr is usually one that gets shredded in nickel and 4-LB sets.
- **OL6+, DL5+, S3+ and WR4+ are injury insurance only.** Minimum contracts, and don't spend picks on them.
- **Fatigue rotation stacks on top of this.** `FATIGUE_POS = RB, WR, TE, DL, LB, CB, S` — those positions rotate on energy every game, so backups take real snaps beyond formation requirements. QB, OL, K and P do not rotate; their depth matters only for injuries.
- Measured example (1919 Rams): RB1 played 16 of 17 games and still took only **80.9%** of RB carries. `compositeRating.rushing` uses `weightsMain: [1]` — whoever is on the field _is_ the entire rushing composite, so RB2's rating fully drives ~20% of the run game.
- This is why a high-ovr team loses to a low-ovr team in a single-elimination playoff (`numGamesPlayoffSeries` is `[1,1,1,1]`). The ovr gap doesn't measure the personnel that a nickel or 4-LB call puts on the field.

---

## Cliff Calculation

**Trigger: any request containing "cliff" or "cliffs"** (cliff list, cliff calc, run the cliffs, etc.). Run this exact procedure — don't improvise a variant.

A "cliff" is how far the team falls at a position when the last man who actually plays goes down. It measures schedule-long steadiness, which team ovr does not.

### Procedure

1. **Pull the live roster** from the league SQLite DB (see the memory note for the path). Take each player's latest `player_ratings` row: `ovr`, `pos`, and age as `season - born_year`.
2. **Age every player one season** by adding the rounded mean ovr delta for his _current_ age:

   | Age | Δ   | Age | Δ   |
   | --- | --- | --- | --- |
   | 21  | +3  | 27  | -2  |
   | 22  | +3  | 28  | -2  |
   | 23  | +1  | 29  | -2  |
   | 24  | +1  | 30  | -3  |
   | 25  | 0   | 31  | -4  |
   | 26  | 0   | 32  | -4  |
   |     |     | 33+ | -3  |

   (Empirical, ~39k player-seasons in this league. Growth stops after 24, peak is 25, the cliff is at 27. Recompute from the DB if the league has run many more seasons.)

3. **Re-sort each position descending** by the aged ovr.
4. **Split at the starter count** (formation maxima, _not_ the ovr-counted slots):

   `QB 1 | RB 2 | WR 3 | TE 2 | OL 5 | DL 4 | LB 4 | CB 3 | S 2`

   **Skip K and P entirely — don't compute or list them.** They're one-deep by design, sit in `FEWER_INJURIES_POS`, and play 16+ games 94% of the time, so their cliff is always huge and always meaningless.

5. **Cliff = (last starter) - (first backup).** If there is no backup, the first backup is `0` and the cliff is the starter's full rating — that means the sim has to field an injured player (`GameSim.football/index.ts`, the "retry without ignoring injured players" fallback).

### Output format

```
QB (1)   84 | 48 45          ->  84 - 48 = 36
RB (2)   54 46 | 43          ->  46 - 43 =  3
LB (4)   55 53 50 47 |       ->  47 -  0 = 47
```

Position, starter count, aged ovrs sorted with `|` at the starter/backup split, then the subtraction. Follow with a list ranked by cliff descending.

### Interpreting

- **Big cliff + high injury rate = real problem.** Starting LB/DL miss a full season ~41% of the time; OL ~38%; QB ~19%.
- **QB cliff is low-frequency, catastrophic-impact** — weight `.1253`, so a 30-point drop is ~-19 team ovr for the duration.
- A cliff of 3-8 at a heavily-used position is healthy. Double digits with no backup is an emergency.

---

## Contracts, Cap, and Signing Order

League settings: `salaryCap` 200M, `minPayroll` 150M, `maxContract` 30M, `minContract` 0.5M, roster 40-55, `rookieContractLengths` `[3, 2]` (round 1 gets 3 years, later rounds 2).

### The minimum-contract exception, and why order matters

`contractNegotiation/accept.ts` blocks a signing only when **both** are true:

```ts
payroll + amount - 1 > g.get("salaryCap") && amount - 1 > g.get("minContract");
```

At exactly 0.500M the second test is false, so **minimum contracts can always be signed, even over the cap** — limited only by `maxRosterSize` 55.

**But they still add to payroll.** Every 0.500 signing shrinks the room available for anyone above the minimum. Therefore:

> **Always sign in descending order of salary. Minimum-salary bodies go dead last.**

Sign one 0.500 body too early and an 0.74M lineman becomes unsignable for the rest of the offseason. Once over the cap: no more above-minimum signings, and no trades that increase payroll.

### Contract length by trajectory

Set term from where the player is on the aging curve (see the delta table in the Cliff section), not from what's cheapest per year:

- **Rising (pot >> ovr, age 22-24): longest term offered.** You buy his peak seasons at today's price. A short deal hands him back at peak ovr with full leverage.
- **Flat or declining (age 26+): shortest term.** Pay the per-year premium to avoid dead years; decline nearly doubles from -0.4 at 26 to -1.9 at 27.
- **Weight-zero bodies (OL6+, DL5+, S3+, WR4+): shortest term, always.** The player is fungible and replaceable at 0.500 every offseason; the cap space is not.
- Aim for deals to **expire at age 27**, which lines up with the standing sell-at-27 rule. See [[project_no_early_extensions]] — re-sign only at expiration.

### Other cap facts

- **Releasing does not free cap space.** `player/release.ts` only clears salary when `justDrafted` is true (drafted this year, before the regular season). Everyone else goes to `releasedPlayers` and keeps counting. Cutting frees a roster spot, not dollars.
- **Never estimate an asking price from `contract_amount` in the DB** — that's the player's _old_ deal. Real asks ran 2-5x higher (Tim Jones: 1.1M old, 7.86M actual). Asks also climb as free agency progresses. Always ask the user what the game is quoting.
- **Hard-cap trades** are blocked only when a team is both over the cap **and** increasing payroll (`trade/summary.ts`), so an under-cap partner can absorb salary with nothing coming back.

---

## Upstream Reference

Upstream: `https://github.com/zengm-games/zengm`
Branch: `master`

To pull upstream changes manually: `git pull upstream master` (add upstream remote first if needed).
Preferred approach: manual diff review in plan mode (see task 9 / `docs/db_conversion.md`).
