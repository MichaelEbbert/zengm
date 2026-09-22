# Fantasy Scoring -- Remaining Tasks

Player fantasy points (`"fp"`) are scored by the functions in `src/common/fantasyPoints.football.ts`, with weights in its `FANTASY_POINTS` object. Each line of the `"fp"` formula in `src/common/processPlayerStats.football.ts` is one call to one of those functions, line-for-line with upstream -- new scoring terms go inside the functions, never as new lines in that formula. See the CLAUDE.md "Modified Files" entry for the rules.

## Done (2026-09-22)

- Weights and scoring moved out of the formula (commit `9aabfa005`).
- Constants set to our schedule: pass yds 1 per 10, 0.01 per completion, pass TD 6, rush/rec yds 1 per 10, rush/rec TD 6, INT and fumble lost -2, XP 1, every FG 4, missed FG -1, receptions 0.
- Return TDs set to 0. Our schedule scores them under DST, which is out of scope.

## Open

- [ ] **Confirm the league's Fantasy Points setting is Standard.** Receptions are worth 0 only under Standard (League Settings -> UI); PPR / Half PPR would add `pprRec` / `halfPprRec` per catch.
- [ ] **Check upstream for formula changes.** Compare upstream master's `"fp"` block in `processPlayerStats.football.ts` with ours. Any new term upstream adds becomes either a new function call line (matching their line) or a term inside one of our functions, plus a constant with a `// default:` comment and an entry in the test's `UPSTREAM_WEIGHTS`.

### Per scoring function: new constants and terms to consider

Each item: add a constant (with its `// default:` comment and a no-op default), add the term inside the function, and add the constant to `UPSTREAM_WEIGHTS` in `fantasyPoints.football.test.ts`. Stats available to player scoring are the raw list in `src/worker/core/player/stats.football.ts`.

- [ ] **`passingYardsPoints`** -- incompletions (`pss - pssCmp`), sacks taken (`pssSk`), sack yards (`pssSkYds`).
- [ ] **`passingTDPoints`** -- nothing obvious. Long-TD bonuses need per-play data the stats don't keep (`pssLng` is only the longest play).
- [ ] **`rushRecYardsPoints`** -- split into separate rushing and receiving yard weights; return yards (`prYds`, `krYds`) if we ever score them for the player instead of DST.
- [ ] **`nonPassTDPoints`** -- split `nonPassTD` into separate rushing and receiving TD weights.
- [ ] **`turnoverPoints`** -- split `turnover` into separate INT and fumble-lost weights; fumbles not lost (`fmb - fmbLost`).
- [ ] **`extraPointPoints`** -- missed XP (`xpa - xp`).
- [ ] **`fieldGoalPoints`** -- per-tier miss penalties (misses are currently one flat `fgMiss`).
- [ ] **`pprReceptionPoints` / `halfPprReceptionPoints`** -- targets (`tgt`), if we ever want them.

### Not possible with constants

- **2-point conversions:** the sim records no 2-point conversion stat. Scoring them needs an engine change.
- **Per-game yardage bonuses (e.g. 300+ pass yds):** `fp` is also calculated on season and career totals, where a per-game threshold can't be applied.
- **DST:** out of scope. It would need a new team-level score, including the points-allowed and yards-allowed tiers.
