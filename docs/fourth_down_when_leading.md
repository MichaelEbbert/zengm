# 4th Down When Leading -- Trial Results

Trial for `FUTURE_PLANS.md` items 1 and 2. Nothing here has shipped: the switches in `FOURTH_DOWN_TUNING` (`coachDecision.ts`) default to the original behavior.

## Baseline, 2026-11-02

Code: `master` at `e7b4546ba` plus the harness changes below. Rosters: Goin Fast LAC (team ovr 63) and BUF (44), not Daily League teams.

### Harness changes

- `simFromState` gained `playToEnd` (play on through the end of regulation), `forceFirstCall` (set the first snap's call), and a `converted` result.
- `FOURTH_DOWN_TUNING` in `coachDecision.ts` holds the 4th-down switches, and `SIM_TUNE` can set them per run.
- New experiment: `-t "fourth down grid"`. `SIM_SHARD=i/n` splits it across processes.

### Go vs punt grid

The leading team has the ball on 4th down, 12:00 left in the quarter, 5,000 replays per cell per team, played to the end of regulation. "Current" is today's logic, which ran on every first snap. "Punt" forces only the first call; both coaches use today's logic after that.

Each cell is **win% under current logic / punting's change in points of win%**. Ties count as half a win. "(ns)" means the change is inside two standard errors (about +/-1.5 in the closer cells); every other cell is a significant loss for punting.

**LAC in the lead**

| Spot              | Qtr | Up 2        | Up 6        | Up 10       | Up 17            |
| ----------------- | --- | ----------- | ----------- | ----------- | ---------------- |
| 4th and 1, own 45 | Q2  | 67.1 / -4.7 | 77.0 / -4.9 | 84.7 / -3.3 | 94.2 / -2.3      |
| 4th and 1, own 45 | Q3  | 67.5 / -6.9 | 81.1 / -5.7 | 89.1 / -3.2 | 97.1 / -0.9      |
| 4th and 1, own 45 | Q4  | 70.6 / -7.6 | 84.3 / -6.8 | 93.8 / -1.9 | 99.4 / -0.3      |
| 4th and 1, opp 47 | Q2  | 67.1 / -6.1 | 77.6 / -4.8 | 86.6 / -4.9 | 94.7 / -2.4      |
| 4th and 1, opp 47 | Q3  | 69.8 / -8.4 | 80.9 / -4.7 | 89.9 / -3.5 | 97.1 / -1.0      |
| 4th and 1, opp 47 | Q4  | 72.5 / -9.5 | 86.3 / -8.6 | 94.6 / -3.5 | 99.5 / -0.5      |
| 4th and 2, opp 47 | Q2  | 66.5 / -5.0 | 77.7 / -5.1 | 85.0 / -4.0 | 94.2 / -2.1      |
| 4th and 2, opp 47 | Q3  | 67.2 / -5.7 | 80.6 / -4.4 | 88.9 / -3.9 | 96.9 / -0.4 (ns) |
| 4th and 2, opp 47 | Q4  | 70.8 / -6.4 | 84.2 / -5.3 | 93.4 / -2.3 | 99.4 / -0.2 (ns) |
| 4th and 3, opp 42 | Q2  | 65.8 / -4.5 | 76.7 / -4.5 | 84.7 / -2.4 | 93.4 / -0.7 (ns) |
| 4th and 3, opp 42 | Q3  | 68.4 / -7.0 | 80.3 / -5.0 | 89.0 / -3.0 | 97.0 / -0.6 (ns) |
| 4th and 3, opp 42 | Q4  | 70.3 / -6.6 | 83.7 / -5.9 | 93.7 / -1.9 | 99.2 / -0.2 (ns) |

**BUF in the lead**

| Spot              | Qtr | Up 2         | Up 6        | Up 10       | Up 17            |
| ----------------- | --- | ------------ | ----------- | ----------- | ---------------- |
| 4th and 1, own 45 | Q2  | 54.1 / -6.3  | 65.4 / -6.0 | 75.6 / -4.9 | 89.0 / -3.2      |
| 4th and 1, own 45 | Q3  | 56.8 / -6.8  | 71.6 / -5.6 | 83.5 / -5.5 | 94.2 / -1.0      |
| 4th and 1, own 45 | Q4  | 62.8 / -7.9  | 78.8 / -6.8 | 91.2 / -4.0 | 98.7 / -0.1 (ns) |
| 4th and 1, opp 47 | Q2  | 55.4 / -7.0  | 66.9 / -5.2 | 76.6 / -5.1 | 90.0 / -3.5      |
| 4th and 1, opp 47 | Q3  | 58.1 / -7.5  | 73.3 / -8.1 | 83.9 / -5.5 | 94.7 / -1.8      |
| 4th and 1, opp 47 | Q4  | 64.6 / -10.7 | 79.9 / -8.2 | 92.4 / -4.4 | 99.1 / -0.8      |
| 4th and 2, opp 47 | Q2  | 53.4 / -5.4  | 66.0 / -5.5 | 76.9 / -5.5 | 89.3 / -2.5      |
| 4th and 2, opp 47 | Q3  | 56.4 / -5.2  | 71.0 / -5.3 | 82.4 / -4.2 | 94.5 / -1.6      |
| 4th and 2, opp 47 | Q4  | 62.5 / -7.1  | 78.5 / -7.3 | 90.2 / -2.7 | 98.8 / -0.3 (ns) |
| 4th and 3, opp 42 | Q2  | 53.0 / -5.6  | 64.6 / -4.2 | 75.4 / -2.9 | 87.4 / -1.5      |
| 4th and 3, opp 42 | Q3  | 55.5 / -5.2  | 71.7 / -6.0 | 82.7 / -4.3 | 94.6 / -1.5      |
| 4th and 3, opp 42 | Q4  | 62.5 / -7.5  | 77.2 / -5.5 | 90.2 / -3.2 | 98.9 / -0.7      |

**Result: punting won no cell.** It lost significantly in 89 of 96 and the other 7 were too close to call, all up 17. Pooled over both teams and all four spots:

| Qtr | Up 2 | Up 6 | Up 10 | Up 17 |
| --- | ---- | ---- | ----- | ----- |
| Q2  | -5.6 | -5.0 | -4.1  | -2.3  |
| Q3  | -6.6 | -5.6 | -4.2  | -1.1  |
| Q4  | -7.9 | -6.8 | -3.0  | -0.4  |

Pooled margins of error (95%) run from +/-0.7 down to +/-0.14. Punting also cost about 1.6 to 2.0 points of scoring margin per replay, and it didn't reduce points allowed: they rose 0.02 to 0.32, because a converted drive keeps the ball away from the opponent.

Conversion rate on the first snap (includes penalties that gave a 1st down):

| Spot              | LAC   | BUF   |
| ----------------- | ----- | ----- |
| 4th and 1, own 45 | 79.9% | 78.5% |
| 4th and 1, opp 47 | 80.2% | 78.6% |
| 4th and 2, opp 47 | 71.4% | 69.7% |
| 4th and 3, opp 42 | 63.0% | 61.2% |

These match the Daily League estimates (about 83% on 4th and 1, about 75% on 4th and 2), a little lower on 2 yards.

**Limits:**

- One pair of teams, with their punters and kickers. No Daily League rosters.
- Replays start with fresh legs and an empty box score, in both arms.
- 12:00 only. The grid doesn't test the `protection` window (Q4 under 8:00), where the coach always punts or kicks.

### Decision

Tweak 1 (punt near midfield when leading) and tweak 2 (extend it to the opp 40) are dropped. Today's logic beat the punt everywhere tested, including the two cases that prompted this: a two-score lead and a big lead.

### Whole-game baseline, 1,000 games, LAC vs BUF

| Measure                       | Config K, 2026-09-11 | Now, after sync 2 |
| ----------------------------- | -------------------- | ----------------- |
| Offensive plays per team-game | 63.8                 | 64.3              |
| Gaps 0-10s                    | 36.6%                | 37.3%             |
| Gaps 11-40s                   | 54.9%                | 54.2%             |
| Gaps 41s+                     | 8.5%                 | 8.5%              |
| Points per team-game          | 23.82                | 24.36             |
| Drives per team-game          | --                   | 11.82             |
| Points per drive              | 2.04                 | 2.06              |
| Hurry-up snaps per game       | 3.51                 | 3.23              |
| Plays under 4s per game       | 4.08                 | 3.82              |
| Points, last 2:00 of 1st half | 5.20                 | 5.34              |
| Points, last 2:00 of 2nd half | 4.46                 | 4.22              |

Use the "Now" column for before/after comparisons on the remaining tweaks.

### Comeback baseline, 2,000 replays per situation

Own 25, 1st and 10, 4th quarter.

| Situation                   | Win   | Tie   | Loss  | Pts for | Drive TD | Drive FG |
| --------------------------- | ----- | ----- | ----- | ------- | -------- | -------- |
| LAC 2:00 left, 3 TO, down 3 | 29.4% | 12.1% | 58.5% | 3.33    | 33.1%    | 12.8%    |
| LAC 2:00 left, 3 TO, down 7 | 4.9%  | 19.0% | 76.1% | 3.24    | 36.9%    | 0.0%     |
| LAC 2:00 left, 3 TO, down 8 | 4.3%  | 14.8% | 80.8% | 3.44    | 37.7%    | 0.0%     |
| LAC 2:00 left, 0 TO, down 3 | 23.9% | 12.8% | 63.2% | 2.54    | 28.6%    | 14.8%    |
| LAC 2:00 left, 0 TO, down 7 | 3.4%  | 20.7% | 75.9% | 2.75    | 37.5%    | 0.0%     |
| LAC 2:00 left, 0 TO, down 8 | 2.8%  | 15.5% | 81.7% | 2.86    | 37.2%    | 0.0%     |
| LAC 1:00 left, 3 TO, down 3 | 19.1% | 21.6% | 59.2% | 2.08    | 20.2%    | 21.6%    |
| LAC 1:00 left, 3 TO, down 7 | 1.0%  | 20.5% | 78.5% | 1.93    | 26.9%    | 0.0%     |
| LAC 1:00 left, 3 TO, down 8 | 0.7%  | 15.2% | 84.2% | 2.03    | 27.0%    | 0.0%     |
| LAC 1:00 left, 0 TO, down 3 | 8.9%  | 22.9% | 68.2% | 1.36    | 9.8%     | 22.9%    |
| LAC 1:00 left, 0 TO, down 7 | 0.2%  | 12.7% | 87.1% | 1.16    | 16.8%    | 0.0%     |
| LAC 1:00 left, 0 TO, down 8 | 0.1%  | 7.7%  | 92.2% | 1.09    | 15.3%    | 0.0%     |
| BUF 2:00 left, 3 TO, down 3 | 22.8% | 12.1% | 65.1% | 2.80    | 24.6%    | 14.0%    |
| BUF 2:00 left, 3 TO, down 7 | 4.2%  | 17.4% | 78.3% | 2.83    | 33.1%    | 0.0%     |
| BUF 2:00 left, 3 TO, down 8 | 3.0%  | 13.2% | 83.8% | 2.84    | 32.1%    | 0.0%     |
| BUF 2:00 left, 0 TO, down 3 | 20.4% | 13.5% | 66.1% | 2.28    | 24.4%    | 16.1%    |
| BUF 2:00 left, 0 TO, down 7 | 2.2%  | 19.2% | 78.5% | 2.31    | 32.0%    | 0.0%     |
| BUF 2:00 left, 0 TO, down 8 | 2.4%  | 13.2% | 84.4% | 2.37    | 31.2%    | 0.0%     |
| BUF 1:00 left, 3 TO, down 3 | 15.8% | 21.9% | 62.3% | 1.85    | 16.2%    | 22.1%    |
| BUF 1:00 left, 3 TO, down 7 | 0.9%  | 17.5% | 81.6% | 1.58    | 22.2%    | 0.0%     |
| BUF 1:00 left, 3 TO, down 8 | 0.4%  | 12.6% | 87.1% | 1.68    | 22.3%    | 0.0%     |
| BUF 1:00 left, 0 TO, down 3 | 8.9%  | 23.6% | 67.5% | 1.37    | 9.6%     | 23.6%    |
| BUF 1:00 left, 0 TO, down 7 | 0.3%  | 10.8% | 88.8% | 0.97    | 14.0%    | 0.0%     |
| BUF 1:00 left, 0 TO, down 8 | 0.4%  | 8.2%  | 91.4% | 1.06    | 14.3%    | 0.0%     |

## Trials, 2026-11-02

Same rosters, 5,000 replays per cell per team, played to the end of regulation. Numbers are points of win% (ties count as half a win), pooled over both teams unless shown by team, with a 95% margin. Experiment: `-t "fourth down trials"`.

### Protection mode: going for it vs today's punt

Q4, under 8:00, leading by 4+. Today's logic punted every time. Pooled over 7:00 and 4:00:

| Spot              | Up 4           | Up 6           | Up 10         |
| ----------------- | -------------- | -------------- | ------------- |
| 4th and 1, own 45 | +8.6 (+/-0.8)  | +8.1 (+/-0.8)  | +2.2 (+/-0.4) |
| 4th and 1, opp 47 | +10.5 (+/-0.8) | +10.3 (+/-0.8) | +2.4 (+/-0.4) |
| 4th and 2, opp 47 | +8.4 (+/-0.8)  | +8.0 (+/-0.8)  | +1.8 (+/-0.4) |
| 4th and 3, opp 42 | +7.5 (+/-0.8)  | +8.0 (+/-0.8)  | +1.3 (+/-0.4) |

**Going for it won all 48 comparisons.** Up 4-6 it's worth about 7-11 points of win%, and up 10 about 1-3. Conversion rates match the grid. Not tested: under 4:00, and go vs field goal when in range.

### Tweak 3: the field goal bar in protection mode

4th and 8, Q4, up 4, 6 and 8, at 6:00 and 3:00, forced field goal vs forced punt.

| Team | Spot   | Make chance | Field goal minus punt |
| ---- | ------ | ----------- | --------------------- |
| LAC  | opp 38 | 0.33        | -0.3 (+/-0.6)         |
| LAC  | opp 35 | 0.45        | +2.3 (+/-0.6)         |
| LAC  | opp 32 | 0.55        | +4.1 (+/-0.6)         |
| LAC  | opp 30 | 0.63        | +5.2 (+/-0.6)         |
| BUF  | opp 38 | 0.51        | +3.1 (+/-0.6)         |
| BUF  | opp 35 | 0.61        | +5.4 (+/-0.6)         |
| BUF  | opp 32 | 0.67        | +6.7 (+/-0.6)         |
| BUF  | opp 30 | 0.71        | +8.0 (+/-0.6)         |

**The proposed 0.65-0.70 bar would lose wins.** The field goal already beats the punt by about 2 at a 0.45 make chance and 4-5 at 0.55-0.63. It breaks even near 0.33, so today's 0.40 bar is about right. The misses that prompted item 2 are real but cost less than the points are worth. **Tweak 3 is rejected.**

### Tweak 4: the 0.40-0.45 window

4th and 3 at each kicker's window yard lines, Q2 and Q3 at 12:00, score -3, 0 and +3. Today's logic punts here.

| Team | Spot   | Make chance | Run minus punt |
| ---- | ------ | ----------- | -------------- |
| LAC  | opp 36 | 0.41        | +7.2 (+/-0.8)  |
| LAC  | opp 35 | 0.45        | +6.7 (+/-0.8)  |
| BUF  | opp 41 | 0.41        | +6.1 (+/-0.8)  |
| BUF  | opp 40 | 0.45        | +6.9 (+/-0.8)  |

**Running won all 24 comparisons, +6.7 pooled (+/-0.4).** `fgWindowUsesTable: true` is the candidate fix, and it has not yet had a whole-game test.

### Limits on these results

- The sim is about 1.3-1.5x too generous to a trailing team in the final two minutes (`docs/clock_play_pacing.md`). That overstates what a punt gives away late, so the protection gains are probably high. Their direction across 48 of 48 cells is not in doubt under this sim.
- High conversion rates drive much of this. NFL-based advice assumes lower ones.
- Same rosters and fresh-legs limits as the baseline.

## Whole-game tests, 2026-11-02

`protectionUsesTable` was added to `FOURTH_DOWN_TUNING`, default false. When true, `protection` still kicks at 0.40 or better, and otherwise uses the normal field-position table instead of always punting. Set per run with `SIM_TUNE`, so no default changed.

### Protection in the last two minutes

Going for it vs today's punt, same setup as the trials above, 5,000 replays per cell per team. Experiment: `-t "protection late"`.

| Spot              | Up 4, 2:00     | Up 4, 1:00    | Up 6, 2:00     | Up 6, 1:00    | Up 10, 2:00   | Up 10, 1:00   |
| ----------------- | -------------- | ------------- | -------------- | ------------- | ------------- | ------------- |
| 4th and 1, own 45 | +13.7 (+/-1.1) | +9.4 (+/-1.0) | +10.9 (+/-1.0) | +9.0 (+/-0.9) | +0.7 (+/-0.3) | +0.0 (+/-0.0) |
| 4th and 1, opp 47 | +13.4 (+/-1.1) | +9.5 (+/-0.9) | +12.1 (+/-1.0) | +8.1 (+/-0.9) | +0.8 (+/-0.2) | +0.1 (+/-0.1) |
| 4th and 2, opp 47 | +12.8 (+/-1.1) | +7.3 (+/-1.0) | +9.6 (+/-1.0)  | +6.8 (+/-1.0) | +0.6 (+/-0.3) | +0.1 (+/-0.1) |
| 4th and 3, opp 42 | +9.8 (+/-1.1)  | +5.8 (+/-1.0) | +9.3 (+/-1.0)  | +5.5 (+/-1.0) | +0.5 (+/-0.3) | +0.0 (+/-0.1) |

**Going for it never lost: better in 44 of 48 comparisons, and the other 4 were too close to call (all up 10 at 1:00).** Up 4-6 it's worth about 5-14 points of win%, because a conversion nearly ends the game. Up 10, the game is already decided. No clock cutoff is needed down to 1:00, so config E wasn't run. Under 1:00 wasn't tested.

### Whole games, 15,000 LAC vs BUF games per config

| Measure                       | A: today | B: window fix | C: protection table | D: both |
| ----------------------------- | -------- | ------------- | ------------------- | ------- |
| LAC win% (ties half)          | 58.0     | 58.2          | 57.3                | 57.4    |
| LAC points per game           | 25.68    | 25.70         | 25.53               | 25.56   |
| BUF points per game           | 22.99    | 23.11         | 23.15               | 23.09   |
| Points per team-game          | 24.34    | 24.41         | 24.34               | 24.33   |
| Offensive plays per team-game | 64.2     | 64.3          | 64.3                | 64.2    |
| Points per drive              | 2.059    | 2.071         | 2.065               | 2.067   |
| Hurry-up snaps per game       | 3.30     | 3.36          | 3.28                | 3.32    |
| Points, last 2:00 of 1st half | 5.53     | 5.56          | 5.42                | 5.47    |
| Points, last 2:00 of 2nd half | 4.25     | 4.31          | 4.29                | 4.31    |

The 95% margins are about +/-1.1 on LAC win%'s difference from A and about +/-0.75 on either team's points. **No config's difference from A is outside those margins, so the whole-game effect is too small to detect at this sample size.** That's expected: these calls come up rarely and both teams get the rule, so gains for the leader offset. LAC at -0.7 (+/-1.1) under C is inside the noise. These runs show the rules don't disturb the game: plays, hurry-up snaps, scoring and late-half points are essentially unchanged. They don't confirm the single-play gains.

### Comebacks, 2,000 replays per situation

| Config              | Trailing team win+tie, change vs A | Drive TD, change vs A |
| ------------------- | ---------------------------------- | --------------------- |
| B: window fix       | +0.08 (+/-0.53)                    | +0.02                 |
| C: protection table | -0.23 (+/-0.53)                    | -0.25                 |
| D: both             | +0.35 (+/-0.53)                    | -0.01                 |

Comeback rates are unchanged in all three configs. No single situation stands out beyond what 24 comparisons would produce by chance.

### Status

| Tweak                                                  | Result                                                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| 1. Punt near midfield when leading                     | Dropped: lost or tied everywhere                                                                        |
| 2. Extend it to the opp 40                             | Dropped: same result                                                                                    |
| 3. Raise the protection field goal bar                 | Rejected: loses wins                                                                                    |
| 4. Fix the 0.40-0.45 window (`fgWindowUsesTable`)      | Recommended: +6.7 per decision, whole game and comebacks unchanged                                      |
| New: protection uses the table (`protectionUsesTable`) | Recommended: going won or tied all 96 comparisons from 7:00 to 1:00, whole game and comebacks unchanged |

Neither default has changed. Both still need the user's decision and a league check.
