# Desperation Mode Research -- 2026-11-02

`FUTURE_PLANS.md` item 3. Question: do interceptions cluster when trailing late, and does the pass-heavy `desperation` play-calling cost wins?

## Code check

- `probInt()` (`GameSim.football/index.ts`) depends only on ratings: no score, clock or down term.
- `determineMode()` puts a trailing team in `desperation` in Q4: down 1-3 under 3:00, down 4-7 under 5:00, down 8+ under 8:00, and in overtime. `playDecision()` then passes unless 2 yards or less to go.
- `hurryUp()` now only changes the dead time between plays (config K, `playClock.ts`), not the play call.

## Where interceptions happen

15,000 sim games, LAC vs BUF, coach on both sides:

| Mode          | Share of snaps | Pass rate | Share of INTs | INT per pass |
| ------------- | -------------- | --------- | ------------- | ------------ |
| Desperation   | 9.9%           | 92%       | 14.6%         | 2.11%        |
| Normal, Q1-Q3 | 71.0%          | 61%       | 68.5%         | 2.07%        |
| Normal, Q4    | 14.3%          | 66%       | 14.3%         | 1.99%        |
| Protection    | 4.8%           | 34%       | 2.6%          | 2.06%        |

The 37 Daily League play-by-play dumps (2001-2002, mostly Rams games) agree: desperation had 14.8% of passes, 9.0% of INTs, 1.5% per pass (6 INTs, a small sample).

**Interceptions don't cluster.** The rate per pass is flat. Desperation throws more, so it has a slightly larger share of INTs (about 0.24 per game), and teams that throw one there win 3.9% of the time because they were already trailing late.

## Does pass-heavy cost wins?

From the own 25, 1st and 10, Q4, each team trailing in turn, 10,000 replays per cell, played to the end of regulation. `DESPERATION_TUNING.playCalls` options:

- `passHeavy`: today's play-calling.
- `normal`: normal-mode calls in desperation.
- `fgRange`: normal calls when down 3 or less at the opponent's 35 or closer with 1:00+ left.
- `closeGame`: normal calls when down 3 or less, anywhere.

Change in win% (ties count half) vs `passHeavy`, pooled over both teams and 2:00 / 4:00 / 7:00:

| Down | passHeavy win% (LAC / BUF) | normal | fgRange | closeGame                           |
| ---- | -------------------------- | ------ | ------- | ----------------------------------- |
| 3    | 34.7-38.5 / 28.6-31.2      | +2.7   | +1.0    | **+1.9** (6 of 6 cells significant) |
| 7    | 14.9-19.9 / 12.4-14.8      | +0.3   | +0.3    | +0.0                                |
| 8    | 12.0-17.5 / 9.4-13.4       | +0.2   | -0.1    | +0.4                                |
| 10   | 1.7-9.3 / 1.3-6.4          | -1.0   | +0.2    | +0.1                                |
| 14   | 0.6-3.6 / 0.5-2.4          | -0.6   | +0.0    | +0.0                                |

- **`normal` everywhere** helps down 3 but hurts down 10-14, where two scores are needed. Part of its down-3 gain is the opponent's: once the leader falls behind by 4-7, `normal` makes it play worse too.
- **`closeGame`** keeps only the down-3 gain: better in 9 of 30 cells, worse in none, pooled +0.48 (+/-0.15). Down 3, it throws a third fewer interceptions (about 0.17 to 0.12 per replay).

## Clock cutoff

The whole-game check of `closeGame` found it losing 4-7 points of win% down 3 with 1:00 left: there, today's code throws on every down in its own half, and normal calls ran the clock out. `closeGameMinClock` keeps pass-heavy below a cutoff. Down 2-3 from the own 25, both teams, 3 and 0 timeouts, 10,000 replays per cell, change vs `passHeavy`:

| Start | passHeavy win% | No cutoff | 1:00 | **1:06** | 1:30 | 2:00 |
| ----- | -------------- | --------- | ---- | -------- | ---- | ---- |
| 3:00  | 32.5           | +4.1      | +3.4 | **+3.5** | +2.0 | +1.0 |
| 2:00  | 32.8           | +3.9      | +3.2 | **+2.9** | +1.5 | +0.9 |
| 1:30  | 33.5           | +0.6      | +0.9 | **+0.9** | -0.3 | +0.1 |
| 1:00  | 30.1           | -4.9      | -1.4 | **+0.0** | -0.3 | -0.3 |
| 0:40  | 21.6           | -6.0      | -0.1 | --       | -0.1 | -0.2 |

Margins are about +/-0.45. At exactly 1:00, a 1:00 cutoff still calls the first snap normally, which costs 1.4; 1:06 avoids that and keeps the gains.

## Decision -- adopted 2026-11-02

`DESPERATION_TUNING` defaults: `playCalls: "closeGame"`, `closeGameMinClock: 1.1`. When down 3 or less in desperation with 1:06 or more left, the coach calls plays as in normal mode, still at hurry-up pace; otherwise pass-heavy as before.

Final check against the code before it (with item 8), LAC vs BUF:

- 15,000 whole games: LAC win% 58.2 -> 58.0, points per team-game 24.41 -> 24.26, plays 64.3 -> 64.2. Both inside their margins.
- Comeback scenarios (2,000 each, margin about +/-2.8): down 3 at 2:00 +2.1 to +4.9; down 3 at 1:00 -1.8 to +0.9 (the rule doesn't apply there, so noise); down 7-8 -1.5 to +1.2.
