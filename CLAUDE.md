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
