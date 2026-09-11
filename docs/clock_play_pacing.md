# Clock and play pacing

**Status: leading plan chosen (below), nothing implemented.** The earlier
candidate fixes were dropped 2026-09-10 in favor of it. Moved here 2026-09-10
from `zengm-press`, where it was written as read-only research on the Daily
League's 2001 season. The findings sections are kept as written, including the
line numbers of the time; use the table for current locations. Transcript
paths (`game-notes/...`) are relative to `zengm-press`.

## Leading plan: new clock model (2026-09-10)

The "new clock" dev plan. Theory stage -- not yet mapped onto the sim code. Every snap-to-snap gap is built from two parts: **live-action time** (snap to whistle, part 1) and **dead time** after the whistle (part 3), which depends on how the play ended and when. Part 2 sets how often plays end out of bounds.

### 1. Play length (live action)

**Targets:** hard floor 4s, realistic max 12s, mean 6s, and 10-12s plays rare -- a few per game.

**Why not one bell curve:** the mean sits 2s above the floor but 6s below the max. A symmetric curve wide enough to reach 10-12s piles thousands of draws against the floor, and a triangle can't hit a mean of 6 without its peak falling below 4. Real play lengths are right-skewed: a hard floor and a long tail.

**Shape: two kinds of plays.**

1. **Normal plays (97%):** Gaussian, mean 5.8, standard deviation 1. A draw under 4 is redrawn; capped at 10.
2. **Big plays (3%):** uniform between 10 and 12.

Mean = 0.97 x 5.88 + 0.03 x 11 = **6.0** (redrawing below 4 lifts the normal-play mean from 5.8 to 5.88).

| Length | Share | Plays per 130 |
| ------ | ----- | ------------- |
| 4-5s   | 17.8% | 23            |
| 5-6s   | 37.0% | 48            |
| 6-7s   | 30.7% | 40            |
| 7-8s   | 10.2% | 13            |
| 8-9s   | 1.3%  | 2             |
| 9-10s  | 0.1%  | ~0            |
| 10-12s | 3.0%  | **4**         |

**Knobs, one per requirement:** the floor is the redraw below 4; the max is the top of the big-play range; the mean is set by 5.8 and the big-play share together; "a few per game" is the big-play share (2% gives ~2.6 per game -- then raise 5.8 to 5.9 to hold the mean at 6).

The near-empty 9-10s row is intended: long plays aren't slow ordinary plays, they're a different event (breakaway, scramble, deep ball). **In the sim, the big-play branch should come from the play's result** -- a long gain or a return -- rather than a random 3% roll, so the 11-second plays are the 50-yard ones.

### 2. Out-of-bounds rates

After the play, the engine rolls whether it ended out of bounds and stopped the clock (`Play.ts`). The run and completion rates are too high against real-football estimates (5-8% of runs and 12-15% of pass plays go out of bounds):

| Outcome        | Engine now | Plan  |
| -------------- | ---------- | ----- |
| Run            | 15%        | ~6-7% |
| Completed pass | 25%        | ~20%  |

The completion target assumes the 12-15% is measured over all pass plays; with ~65% of passes caught, that's ~18-23% per completion, and the engine rolls only on completions. Sacks (2%) and own-team fumble recoveries (5%) are unchanged. Exact values get set when tuning against the harness.

### 3. Dead time after the play

Taken off the game clock after the play's own seconds (part 1). The play clock is 40s from the whistle; a normal-tempo offense snaps with ~8s left on it.

**Late windows** = the last 2:00 of the first half and the last 5:00 of the game, and the last 5:00 of every overtime period (the engine's `kickoffAfterEndOfPeriod` already treats overtime as a final period). Inside them an out-of-bounds play stops the clock until the snap, as the engine does now all game; outside them the clock restarts once the ball is spotted (NFL rule).

| #   | How the play ended                                             | Dead time                                                                                          |
| --- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1   | Timeout called after the play                                  | 0-2s                                                                                               |
| 2   | In bounds, normal tempo                                        | Gaussian, mean 32s (40 - 8), sd ~3.5, clipped to 24-39s                                            |
| 3   | Out of bounds, outside the late windows                        | Mean 24s: as #2, but the clock is stopped the ~8s it takes officials to spot the ball (clip 16-31) |
| 4   | Out of bounds, inside a late window                            | 0s                                                                                                 |
| 5   | Incomplete pass (and spike, whose play takes ~1s)              | 0s, all game                                                                                       |
| 6   | Score (TD, FG, safety)                                         | 0s; the extra point or two-point try is untimed                                                    |
| 7   | Kickoff                                                        | Touchback: no time at all. Return: clock starts on the returner's touch; play length per part 1    |
| 7a  | Punt or interception touchback; fair catch                     | Play length 4-6s (hang time only), then 0s -- clock stopped until the snap                         |
| 7b  | Onside kick recovered by the kicking team                      | As #2                                                                                              |
| 8   | Change of possession -- punt, turnover, and so kickoff returns | As #3: clock stops, restarts once the ball is spotted                                              |
| 9   | Penalty (accepted or offsetting, before or after the snap)     | Gaussian, mean 16s, clipped 8-23s (as #2/#3 with a lower mean) -- see below                        |
| 10  | Two-minute warning, end of the 1st or 3rd quarter              | 0s beyond the play itself (the engine already handles the two-minute warning)                      |
| --  | Kneel                                                          | Leave to the engine's existing kneel handling                                                      |
| --  | First down                                                     | Nothing -- NFL chain moves don't stop the clock                                                    |

**One play-length draw per play, capped at 12s.** Returns and kicks use the part 1 distribution like any other play, with the 10-12s big-play branch for long returns. Compound plays -- a pass with an interception return and a fumble, a punt with a return -- still get a single draw; we aren't tracking where players are on the field, so the pieces aren't added together.

**Penalties (#9):** if a play ran, its play length was already charged; if it didn't (a pre-snap foul), none was. Either way the 16s dead time is charged before the next snap -- players hearing the call, the referee walking off the spot, then the huddle. The 8-23s clip is derived (the same -8/+7 around the mean as #2); the sd matches #2.

**Fair catches don't exist in the sim today**; #7a applies if they're added.

**The 24-39s clip is a starting value.** If plays per game come out too low, lower either or both endpoints.

**The `pace` league setting** divides the dead time today (`index.ts:1248`). Keep applying it to the new dead-time draw, after the clip; at `pace` 1 that's a no-op. How other `pace` values should interact with the new model needs more discussion.

### Hurry-up

Hurry-up gets the same play + dead-time model, with a shorter dead time than #2 (snapping with ~25s on the play clock, ~10-15s of dead time, as a starting guess) in place of today's 5-13s band. **Keep the existing "leave time for a field goal" rule** (`index.ts:1241`): if the hurry-up dead time would run out the half, charge only 0-4s -- a stand-in for a spike or quick snap so the trailing team keeps its last kick. **Change it gently: the engine's comeback ability must survive.** Measure hurry-up before and after with the harness -- late-game comeback win rate, points in the final two minutes, hurry-up plays per game -- and keep the after close to the before.

### Order of work, and tuning

Build all four pieces with the starting values above first -- play length, out-of-bounds rates, dead time, hurry-up -- each with red-then-green tests and a harness run after it to catch breakage. Tune only once all four are in, because they pull plays per game in opposite directions (piece 1 cost ~5 plays; the shorter dead time should give them back).

**Tuning targets:** ~60-63 offensive plays per team-game (the league runs ~60, the NFL ~63), a real middle in the 11-40s gap band, and comeback rates close to baseline v3.

**Tuning steps (decided 2026-09-10):**

- Push the three dead-time means down 2s per round -- in bounds 32 -> 30 -> 28..., out of bounds 24 -> 22..., penalty 16 -> 14... -- until the targets are met.
- Also try 1-2s less on the average live-ball time. Note the 4s floor: lowering the 5.8 center alone barely moves the average (at 4.8, a fifth of draws fall under 4 and are redrawn, so the average only reaches ~5.3). A real 1-2s cut needs the floor lowered too.
- **Preference: avoid 3-second plays** (not a hard rule). So live-ball time is the last lever -- lower the dead-time means first, then nudge the play-length center, and keep the 4s floor unless nothing else gets there.

### Progress

| Piece                  | Status                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1. Play length         | Done (`playClock.ts`, wired into `simPlay`); tested; uncommitted                                                          |
| 2. Out-of-bounds rates | Done (`OUT_OF_BOUNDS_RATE` in `playClock.ts`, read by `Play.ts`); tested; uncommitted                                     |
| 3. Dead time           | Done (`DEAD_TIME`, `deadTimeCase` in `playClock.ts`; `outOfBounds` / `penaltyEnforced` in `Play.ts`); tested; uncommitted |
| 4. Hurry-up            | Done as rethought below (`HURRY_UP_OUT_OF_BOUNDS_RATE`; `Play.hurryUp` set at the snap); tested; uncommitted              |

**After piece 1** (1,000 games + comebacks, vs baseline v3): offensive plays per team-game 63.4 -> 58.4, points 23.5 -> 22.1, points per drive unchanged (2.03 -> 2.07), hurry-up snaps per game 4.8 -> 3.9. 0-5s gaps 45.6% -> 25.9% and 6-10s 14.5% -> 32.4% (stopped-clock plays now take ~6s, not ~2-6s). Comeback TD rates fell 4-10 points in the tight-clock cells (1:00 left, or no timeouts), most for the weaker BUF offense: 2:00 / 0 TO / down 8 went 29.8% -> 20.2%. Piece 4 (hurry-up) has to win that back; piece 3 won't, since hurry-up snaps skip normal dead time.

**After piece 2:** offensive plays per team-game 58.4 -> 56.0 (fewer out-of-bounds stops, 14.7 -> 9.3 per game, means more running-clock snaps); points 22.1 -> 21.2, points per drive unchanged (2.08). Comeback rates within noise of piece 1 -- the tight-clock drop is piece 1's.

**After piece 3:** offensive plays per team-game 56.0 -> **61.2** (in the 60-63 target); the gap shape is transformed -- 0-10s 33.7%, **11-40s 55.8%** (was 2.2%), 41s+ 10.5%; points 23.1 per team-game, 2.09 per drive. But comebacks took a second hit: tight-clock TD rate 17.1% -> 13.9% (v3: 20.2%), 2:00-with-timeouts 32.4% -> 28.9% (v3: 31.8%); late-half points 5.1 -> 4.3 (1st half) and 4.0 -> 3.6 (2nd). Main suspect: a penalty now costs 16s even inside the late windows (~0.6 penalties per two-minute drive, ~10s lost), plus timeouts costing 0-2s instead of 0.

**After piece 4** (hurry-up out of bounds 30% / 10%): plays 60.9; tight-clock comeback TD 14.4% (+0.5 on piece 3) -- the first step barely moves it.

**Tuning round 1** (comeback scenarios only, 1,000 replays per cell; `SIM_TUNE` overrides, source unchanged). Comeback TD rate in the tight cells (1:00 left, or no timeouts) and in the 2:00-with-timeouts cells, then win+tie in the same two groups:

| Config                                    | TD tight | TD 2:00 w/ TOs | Win+tie tight | Win+tie 2:00 w/ TOs |
| ----------------------------------------- | -------- | -------------- | ------------- | ------------------- |
| Baseline v3                               | 20.2%    | 31.8%          | 19.1%         | 23.1%               |
| Piece 4 as built (hurry-up OOB 30% / 10%) | 14.4%    | 28.7%          | 16.2%         | 24.7%               |
| A: hurry-up OOB 45% / 15%                 | 16.4%    | 30.6%          | 17.4%         | 26.1%               |
| B: hurry-up OOB 60% / 20%                 | 17.8%    | 32.4%          | 18.8%         | 26.8%               |
| C (diagnostic): penalty dead time ~0      | 17.5%    | 32.6%          | 18.9%         | 26.4%               |
| D (diagnostic): hurry-up band 3-9s        | 15.8%    | 30.1%          | 17.2%         | 24.8%               |

B restores the tight-clock win+tie rate; penalty dead time inside the late windows accounts for ~3 points of the TD drop; a shorter hurry-up band helps least.

**Tuning round 2** (1,000 games + comebacks at 2,000 replays per cell). E is B plus the first dead-time step (every mean 2s lower: 30 / 22 / 22 / 14).

| Measure                       | Baseline v3  | B (hurry-up OOB 60/20) | E (B + dead time -2s) |
| ----------------------------- | ------------ | ---------------------- | --------------------- |
| Plays per team-game           | 63.4         | **61.5**               | 64.4                  |
| Gaps 0-10s / 11-40s / 41s+    | 60 / 2 / 38% | 35 / 55 / 10%          | 34 / 61 / 5%          |
| Points per team-game          | 23.5         | 22.8                   | 23.9                  |
| Points per drive              | 2.03         | 2.03                   | 2.06                  |
| Points, last 2:00 of 1st half | 5.56         | 4.42                   | 4.49                  |
| Points, last 2:00 of 2nd half | 4.48         | 3.81                   | 3.80                  |
| Comeback TD, tight cells      | 20.2%        | 16.8%                  | 16.6%                 |
| Comeback TD, 2:00 w/ TOs      | 31.8%        | 30.7%                  | 31.0%                 |
| Comeback win+tie, tight       | 19.1%        | 18.0%                  | 17.3%                 |
| Comeback win+tie, 2:00 w/ TOs | 23.1%        | 25.3%                  | 25.3%                 |

(Round 1's 1,000-replay B looked better -- 17.8% / 18.8% -- partly noise.) **B is now the source default.** E overshoots the 60-63 plays target, so the dead-time means stay at the plan's 32 / 24 / 24 / 16; a 1s step (not run) would likely land near the NFL's 63. Dead time doesn't touch comebacks (hurry-up snaps skip it), as expected.

**Tuning round 3 -- measuring open question #1** (penalties stop the clock outright inside the late windows; `LATE_WINDOW_RULES.penaltyDeadTime` is `true` by default = the approved 16s rule, flipped only via `SIM_TUNE` here):

| Measure                               | Baseline v3  | B (default)  | F: no late penalty time, hurry-up OOB 60/20 | G: no late penalty time, hurry-up OOB 45/15 |
| ------------------------------------- | ------------ | ------------ | ------------------------------------------- | ------------------------------------------- |
| Plays per team-game                   | 63.4         | 61.5         | 62.8                                        | 62.3                                        |
| Points per team-game / per drive      | 23.5 / 2.03  | 22.8 / 2.03  | 23.4 / 2.03                                 | 23.2 / 2.06                                 |
| Points, last 2:00 of 1st / 2nd half   | 5.56 / 4.48  | 4.42 / 3.81  | 5.05 / 4.19                                 | 5.08 / 4.14                                 |
| Comeback TD, tight / 2:00 w/ TOs      | 20.2 / 31.8% | 16.8 / 30.7% | 21.5 / 34.8%                                | 16.9 / 30.0%                                |
| Comeback win+tie, tight / 2:00 w/ TOs | 19.1 / 23.1% | 18.0 / 25.3% | 21.3 / 26.2%                                | 18.2 / 23.8%                                |

Taking penalty time out of the late windows closes most of the late-half scoring gap (to ~-0.4 from ~-1). With it, 60/20 hurry-up out of bounds overshoots the comeback baseline a little and 45/15 undershoots the TD rate; H (52/17) splits the difference:

| Measure                               | Baseline v3  | H: no late penalty time, hurry-up OOB 52/17 |
| ------------------------------------- | ------------ | ------------------------------------------- |
| Plays per team-game                   | 63.4         | 62.2                                        |
| Gaps 0-10s / 11-40s / 41s+            | 60 / 2 / 38% | 36 / 54 / 10%                               |
| Points per team-game / per drive      | 23.5 / 2.03  | 23.5 / 2.10                                 |
| Points, last 2:00 of 1st / 2nd half   | 5.56 / 4.48  | 5.26 / 4.22                                 |
| Comeback TD, tight / 2:00 w/ TOs      | 20.2 / 31.8% | 19.0 / 33.2%                                |
| Comeback win+tie, tight / 2:00 w/ TOs | 19.1 / 23.1% | 19.7 / 25.3%                                |

**H is the recommended final configuration:** every guardrail within ~1-2 points of the baseline, late-half scoring within 0.3, plays per team-game 62.2 (target 60-63), and the 11-40s middle band holding 54% of gaps. Adopting it = decision #1 below (`LATE_WINDOW_RULES.penaltyDeadTime = false`) plus `HURRY_UP_OUT_OF_BOUNDS_RATE` 0.52 / 0.17 -- two constant changes in `playClock.ts`.

### Roster-lottery finding, 2026-09-11

**Every harness comparison above (baseline v3, pieces 1-4, tuning rounds 1-3) carries a roster lottery.** Depth charts sort on scouting-fuzzed ratings, and the real-roster loader re-rolled each player's fuzz on every load -- so the starters changed from run to run, even the QB (LAC: Jordan Allen or Jacob Tiller; BUF: Gaston Harris or Justin Matthews), and most OL/DL/LB slots. That's why the final config's comeback rates fell 1.5-4 points below H in nearly every cell even though a 1s dead-time change can't touch comeback drives. Fixed: real rosters load with fuzz 0 (depth sorted on true ratings, identical every load; guarded by a test). The before-baseline was re-measured from a git worktree at the last commit (old clock code + the same fix) as **baseline v4**, and the final config re-run on the same depth charts -- see "Final comparison" below. Treat the earlier tables as directional only.

### Final comparison, 2026-09-11 -- same starters, before vs after

Baseline v4 (old clock code, from a git worktree at the last commit, `C:\claude_projects\zengm-baseline`) against the final config (all four pieces, the 2026-09-11 decisions), both with fuzz-free real rosters, so the only difference is the clock. 1,000 games each; comebacks 2,000 replays per cell.

| Measure                               | Before (old clock) | After (new clock)      |
| ------------------------------------- | ------------------ | ---------------------- |
| Offensive plays per team-game         | 63.1               | **63.7**               |
| Gaps 0-10s / 11-40s / 41s+            | 59.7 / 2.2 / 38.0% | 36.0 / **57.0** / 7.0% |
| Points per team-game / per drive      | 23.84 / 2.08       | 23.79 / 2.05           |
| Hurry-up snaps per game               | 4.96               | 3.22                   |
| Points, last 2:00 of 1st half         | 5.98               | 5.00                   |
| Points, last 2:00 of 2nd half         | 4.34               | 4.12                   |
| Comeback TD, tight / 2:00 w/ TOs      | 21.7 / 33.7%       | 20.0 / 32.9%           |
| Comeback win+tie, tight / 2:00 w/ TOs | 20.5 / 24.3%       | 20.6 / 25.8%           |

**Verdict: the clock shape is fixed and the game's volume, scoring and comebacks survive.** Plays and points are unchanged; the empty 11-40s band now holds 57% of gaps; comeback win+tie is level or better in every group.

Remaining soft spots:

- **1:00 left with 3 timeouts, down 7-8:** the one place comebacks lost ground -- TD rate down 3-6 points (LAC down 8: 25.7% -> 19.4%; BUF down 8: 23.1% -> 17.3%), win+tie down 2-3. Timeouts now cost 0-2s instead of 0, and 6s plays fit fewer snaps into a minute. Candidate knob: timeout dead time back to 0.
- **Last 2:00 of the first half: -1.0 points.** First-half hurry-up only starts at midfield (`hurryUp()` needs `scrimmage >= 50` before halftime), so a first-half drive from deep pays full dead time. Not tuned.

### Hurry-up play length and the timeout fix, 2026-09-11

Two changes, both approved: hurry-up snaps (normal plays only) use `HURRY_UP_PLAY_LENGTH` -- center 4.5s, floor 3s, same 10s cap -- and timeouts are only called while the clock is running (a timeout after an already-stopped clock wasted the timeout and 0-2s). Same starters as the final comparison above:

| Measure                               | Before (old clock) | Final (above) | + these two changes |
| ------------------------------------- | ------------------ | ------------- | ------------------- |
| Offensive plays per team-game         | 63.1               | 63.7          | 64.8                |
| Plays under 4s per game (both teams)  | --                 | --            | **4.1**             |
| Points per team-game / per drive      | 23.84 / 2.08       | 23.79 / 2.05  | 24.72 / 2.10        |
| Points, last 2:00 of 1st / 2nd half   | 5.98 / 4.34        | 5.00 / 4.12   | 5.45 / 4.82         |
| Comeback TD, tight / 2:00 w/ TOs      | 21.7 / 33.7%       | 20.0 / 32.9%  | 22.9 / 35.2%        |
| Comeback win+tie, tight / 2:00 w/ TOs | 20.5 / 24.3%       | 20.6 / 25.8%  | 21.5 / 25.4%        |

The 1:00-with-3-timeouts corner is fixed: LAC down 8 TD rate 25.7% (old clock) -> 19.4% (final) -> 25.4%; BUF down 8 23.1% -> 17.3% -> 23.4%. Comebacks now sit ~1 point above the old clock overall. The 4.1 short plays per game are all two-minute-drill snaps. Plays per team-game (64.8) run ~1.8 over the 63 target; the plan's +1s dead time (32 / 24 / 24 / 16) is the knob if that matters.

### Config K -- production, 2026-09-11

**K = J + 0.5s dead time**, adopted as the production clock (user's call, then season sims in TEST_LEAGUE_1). J is the hurry-up-length + timeout-fix config above; K moves every dead-time mean up 0.5s to 31.5 / 23.5 / 23.5 / 15.5 (no rounding anywhere -- the draws and the game clock are continuous, so half-second steps are real). Same starters:

| Measure                              | Original clock | J     | K (production) |
| ------------------------------------ | -------------- | ----- | -------------- |
| Offensive plays per team-game        | 63.1           | 64.7  | **63.8**       |
| Gaps 0-10s                           | 59.7%          | 36.8% | 36.6%          |
| Gaps 11-40s                          | 2.2%           | 56.3% | 54.9%          |
| Gaps 41s+                            | 38.0%          | 6.9%  | 8.5%           |
| Points per team-game                 | 23.84          | 24.23 | **23.82**      |
| Points per drive                     | 2.08           | 2.04  | 2.04           |
| Hurry-up snaps per game              | 4.96           | 3.66  | 3.51           |
| Plays under 4s per game              | --             | 4.09  | 4.08           |
| Points, last 2:00 of 1st half        | 5.98           | 5.41  | 5.20           |
| Points, last 2:00 of 2nd half        | 4.34           | 4.86  | 4.46           |
| Comeback TD, tight clock             | 21.7%          | 22.9% | 23.0%          |
| Comeback TD, 2:00 with timeouts      | 33.7%          | 35.2% | 34.2%          |
| Comeback win+tie, tight clock        | 20.5%          | 21.5% | 21.5%          |
| Comeback win+tie, 2:00 with timeouts | 24.3%          | 25.4% | 25.1%          |

**Versus the NFL** (Football Commentary's two-minute-drill model, and ESPN): both the original clock and K are ~1.3-1.5x too generous to a trailing team in the final two minutes -- e.g. down 7-8 at ~2:00 from the own 25, the sim scores a TD ~33-35% of the time vs ~20-27% in the NFL. That predates the clock work; the lever is late-game offensive efficiency (see "Desperation Mode Tuning" in `FUTURE_PLANS.md`), not the clock. Not addressed here.

### League validation, TEST_LEAGUE_1 season 2030 -- shipped 2026-09-11

The user simmed season 2030: weeks 1-2 on the old clock, weeks 3+ on K. The early 1st-down pass tweak in `coachDecision.ts` (25% pass on 1st and 6-10 before the 5-and-5 ratio threshold, always run on 1st and 5 or less) went live at week 5 -- the Q1 1st-down pass share jumps from ~12% to 21-37%. Per team-game, regular season:

| Measure                               | Old clock, 2026-29 (1,088 games) | New clock, 2030 wk 3+ (240 games) |
| ------------------------------------- | -------------------------------- | --------------------------------- |
| Offensive plays                       | 61.24                            | 61.81                             |
| Points / drives / points per drive    | 23.16 / 11.00 / 2.11             | 24.57 / 11.28 / 2.18              |
| Points, last 2:00 Q2 / last 5:00 Q4   | 5.45 / 6.90                      | 5.22 / 7.79                       |
| FG attempts in the last 0:10 per game | 0.465                            | 0.446                             |
| Average margin / OT rate              | 11.5 / 4.6%                      | 11.3 / 5.0%                       |
| TD play length, mean / under 4s       | 5.0s / 38%                       | 7.2s / 4%                         |

Plays match the harness (+0.6). The points rise is within season-to-season drift (22.4-24.0) plus a small coach-tweak effect; game shape (margins, close games, OT, turnovers) is unchanged. The user accepted K and the coach tweak as production; the play-by-play also gained a "went out of bounds" line (`Play.outOfBoundsPlayer`).

### Decisions, 2026-09-11

1. **Penalties inside the late windows: approved** -- they stop the clock outright (`LATE_WINDOW_RULES.penaltyDeadTime = false`), with hurry-up out of bounds at H's 52% / 17%.
2. **Row 8 (change of possession) at 0s inside the late windows: confirmed.**
3. **Dead time 1s lower: approved** -- 31 / 23 / 23 / 15s, clip ranges moved with them. Retest results below.
4. Answered: the H numbers were at 52% hurry-up out of bounds, not 60%; 60% with late penalties free overshoots the comeback baseline.

### State at the end of 2026-09-10, and decisions for the user

All four pieces are built and tested; **nothing is committed** (the user's rule: no commits until the end). Current defaults: play length 5.8 / 1 / 4-10s, big plays 20+ carry or 30+ return yards; out of bounds 6.5% runs / 20% completions, hurry-up 20% / 60%; dead time 32 / 24 / 24 / 16s, timeouts 0-2s; row 8 (change of possession) is 0s inside the late windows.

Open for the user:

1. **Penalties inside the late windows.** Currently 16s (as approved). Making them 0 inside the windows, like out of bounds, is worth ~3 points of comeback TD rate and closes most of the late-half scoring gap. Measured above (round 3): with hurry-up out of bounds at 52/17 ("H") it's the closest match to the baseline on every guardrail. **Recommended.**
2. **Row 8 inside the late windows** was set to 0s (the recommended option) while the user was away -- confirm or flip.
3. **Plays per game:** 61.5 with the plan's dead-time means. Keep, or take a 1s step toward the NFL's ~63.
4. **Late-half points** are ~1 below the baseline in both halves even with comebacks restored; likely because the baseline's 2-6s stopped-clock plays packed extra snaps into the final minutes. Accept, or investigate.
5. **Hurry-up out of bounds at 60% of completions** is high; it's what it took to restore comebacks without touching the penalty rule. If #1 is adopted, it could come back down (e.g. 45%).

**Piece 4 rethought (2026-09-10):** the plan's hurry-up dead time (~10-15s, replacing 5-13s) would cost comebacks _more_ time, the opposite of the guardrail. Instead: keep the 5-13s band as a tuning knob, and add hurry-up out-of-bounds rates -- a two-minute offense works the sideline, and inside the late windows out of bounds stops the clock outright. Start one small step above normal (completions 20% -> 30%, runs 6.5% -> 10%) and step up while tuning, per the go-ahead to raise stopped-clock frequency in small increments.

### Future considerations (not in this plan)

- Delay of game running the full 40s play clock off.
- The NFL's 10-second runoff for some offensive fouls inside the last 2:00 of a half.

## Current code locations (re-verified 2026-09-10)

| What                                            | Where                                             |
| ----------------------------------------------- | ------------------------------------------------- |
| `hurryUp()`                                     | `GameSim.football/index.ts:622`                   |
| Huddle bands, 5-13s / 37-62s (`dtClockRunning`) | `index.ts:1231-1239`                              |
| Kickoff return time, `returnLength / 8`         | `index.ts:1691` (in `doKickoff()`, `:1550`)       |
| Pass base time, `randInt(2, 6)`; yardage term   | `index.ts:2464`; `:2549` (in `doPass()`, `:2384`) |
| Run time, `randInt(2, 4) + yds / 10`            | `index.ts:2757` (in `doRun()`, `:2630`)           |
| Per-outcome `isClockRunning` rolls              | `Play.ts:728-841`                                 |
| `kr` / `pr` handlers -- no `isClockRunning`     | `Play.ts:754`, `:767`                             |

## Harness baseline v3, 2026-09-10 -- real rosters, the "before" numbers for clock changes

The numbers to compare clock changes against. 1,000 games of Goin Fast's LAC (team ovr 63) vs BUF (44), rosters exported from the league DB into `src/worker/core/GameSim.football/harnessRosters/goinFast1921.json`. Coach play-calling on both sides, neutral site, everyone healthy at kickoff. Re-run with:

```bash
SIM_HARNESS=1 SIM_GAMES=1000 SPORT=football npx vitest run --project football src/worker/core/GameSim.football/simHarness.test.ts -t "clock distribution"
SIM_HARNESS=1 SIM_TRIALS=2000 SPORT=football npx vitest run --project football src/worker/core/GameSim.football/simHarness.test.ts -t "comeback"
```

**Earlier baselines are void.** v1 (500 games, random generated rosters) and v2 (1,000 games, seeded generated rosters) ran with empty depth charts: generated ratings were dated 2016 while the harness season is 2013, and depth charts read only the current season's ratings, so the sim fielded players in roster order -- cornerbacks at QB, 26% completions, ~11 pts per team-game. Fixed in `simHarness.ts` (`toHarnessSeason`) and guarded by a test. The time-between-snaps shape came out the same, since that's clock code; everything else moved.

**The harness now matches the real league:**

| Per team-game    | Harness | Goin Fast 1919-21 |
| ---------------- | ------- | ----------------- |
| Points           | 23.5    | 23.4-25.4         |
| Drives           | 11.5    | 9.0-11.2          |
| Points per drive | 2.03    | 2.09-2.81         |
| Offensive plays  | 63.4    | 59.1-60.7         |

### Offensive plays per team-game (2,000 team-games)

| Mean | Min | 10th pct | Median | 90th pct | Max |
| ---- | --- | -------- | ------ | -------- | --- |
| 63.4 | 35  | 52       | 63     | 74       | 96  |

### Time between snaps, hurry-up excluded

A snap is "hurry-up" when its gap came from the 5-13s huddle branch rather than the normal 37-62s one (`hurryUp()` has a single caller, in that branch, so the flag is exact). Coach desperation mode is not excluded. 149,945 gaps, with 4,684 hurry-up gaps (3.0%) left out. Gaps are rounded to whole seconds (5.4s counts in 0-5s, 5.6s in 6-10s).

| Gap    | Count  | Share |
| ------ | ------ | ----- |
| 0-5s   | 68,315 | 45.6% |
| 6-10s  | 21,704 | 14.5% |
| 11-15s | 1,264  | 0.8%  |
| 16-20s | 252    | 0.2%  |
| 21-25s | 146    | 0.1%  |
| 26-30s | 161    | 0.1%  |
| 31-35s | 161    | 0.1%  |
| 36-40s | 1,389  | 0.9%  |
| 41-45s | 10,456 | 7.0%  |
| 46-50s | 11,160 | 7.4%  |
| 51-55s | 11,073 | 7.4%  |
| 56-60s | 10,864 | 7.2%  |
| 61-65s | 10,560 | 7.0%  |
| 66-70s | 2,440  | 1.6%  |

**Hurry-up isn't what empties the middle.** 60% of gaps are 0-10s, 2.2% are 11-40s, 38% are 41-70s. The split is stopped-clock vs running-clock plays:

- **0-10s:** plays after which the clock is stopped -- incompletions, kicks, penalties, extra points -- charge only the play's own few seconds.
- **41-70s:** the flat ~7%-per-bin block is `randInt(37, 62)` seconds of dead time, uniform across its range, plus 2-4s for the play itself.

### Game level

| Measure                                        | Value |
| ---------------------------------------------- | ----- |
| Points per team-game                           | 23.46 |
| Drives per team-game                           | 11.53 |
| Points per drive                               | 2.03  |
| Hurry-up snaps per game                        | 4.81  |
| Points in the last 2:00 of the 1st half / game | 5.56  |
| Points in the last 2:00 of the 2nd half / game | 4.48  |

Late-half points are both teams' points on snaps taken with 2:00 or less left in the 2nd or 4th quarter. Drives are counted from the engine's own `newDrive` event.

### Clock stops per game, by cause

After a snap, the first matching cause wins; snaps where the clock kept running have none. A declined flag on a play that went out of bounds counts as "penalty". A test (`simHarness.test.ts`, "a snap's stop cause agrees...") checks every cause against the time the engine actually charged.

| Cause                                                                          | Per game |
| ------------------------------------------------------------------------------ | -------- |
| Incompletion                                                                   | 23.42    |
| Change of possession (kickoffs, punts, turnovers, missed FGs, downs)           | 21.63    |
| Out of bounds (the random roll on runs, completions, sacks, recovered fumbles) | 16.10    |
| Score (TDs, FGs, safeties, extra points, two-point tries)                      | 13.75    |
| Penalty                                                                        | 8.46     |
| Timeout                                                                        | 7.96     |
| Two-minute warning                                                             | 2.01     |
| Kneel                                                                          | 1.55     |
| Other                                                                          | 0.02     |

### Comeback drives -- the hurry-up guardrail

1st and 10 at the trailing team's own 25 in the 4th quarter, 2,000 replays per cell, coach play-calling on both sides, each team's real kicker. Timeouts are the trailing team's; the leader has 3. A tie at the end of regulation is left as a tie (no overtime), so "down 7, tie" is a TD and extra point. "Drive TD / FG" is how the trailing team's possession ended.

| Situation          | LAC trailing: win / tie | Drive TD / FG | BUF trailing: win / tie | Drive TD / FG |
| ------------------ | ----------------------- | ------------- | ----------------------- | ------------- |
| 2:00, 3 TO, down 3 | 28.9% / 5.3%            | 32.6% / 1.8%  | 24.3% / 5.7%            | 30.5% / 2.3%  |
| 2:00, 3 TO, down 7 | 4.7% / 18.4%            | 33.2% / 0.0%  | 3.5% / 15.6%            | 29.5% / 0.0%  |
| 2:00, 3 TO, down 8 | 5.2% / 12.6%            | 34.6% / 0.0%  | 2.5% / 12.2%            | 30.2% / 0.0%  |
| 2:00, 0 TO, down 3 | 22.3% / 7.7%            | 27.6% / 7.1%  | 20.7% / 9.4%            | 26.4% / 8.4%  |
| 2:00, 0 TO, down 7 | 2.4% / 17.1%            | 30.3% / 0.0%  | 2.5% / 15.8%            | 27.9% / 0.0%  |
| 2:00, 0 TO, down 8 | 2.4% / 12.6%            | 31.1% / 0.0%  | 2.0% / 12.0%            | 29.8% / 0.0%  |
| 1:00, 3 TO, down 3 | 16.3% / 19.1%           | 17.9% / 18.7% | 12.3% / 20.0%           | 14.3% / 19.7% |
| 1:00, 3 TO, down 7 | 1.7% / 15.6%            | 23.4% / 0.0%  | 1.1% / 14.9%            | 21.0% / 0.0%  |
| 1:00, 3 TO, down 8 | 1.1% / 11.7%            | 22.9% / 0.0%  | 0.8% / 10.2%            | 19.5% / 0.0%  |
| 1:00, 0 TO, down 3 | 8.2% / 19.1%            | 9.3% / 19.0%  | 6.7% / 23.8%            | 7.7% / 23.8%  |
| 1:00, 0 TO, down 7 | 0.6% / 10.0%            | 14.2% / 0.0%  | 0.5% / 9.4%             | 12.7% / 0.0%  |
| 1:00, 0 TO, down 8 | 0.3% / 7.1%             | 14.0% / 0.0%  | 0.4% / 6.8%             | 13.1% / 0.0%  |

What these say:

- **Clock and timeouts drive the result far more than roster strength.** A 19-point team ovr gap moves the TD rate only 2-4 points; going from 2:00 to 1:00 with no timeouts cuts it from ~29% to ~13%. That's the lever a clock change pulls, which makes this a sensitive guardrail.
- **Timeouts matter most with 1:00 left:** 3 timeouts vs none raises the TD rate from ~13% to ~22%.
- The coach passes on the first snap every time, and never settles for a field goal when down 7 or 8.
- **Precision:** at 2,000 replays the standard error is about 1 point on a 30% rate and 0.5 on a 5% rate, so a clock change that moves a rate 3 points or more is a real effect.

## The observation

Prompted by a live-note complaint about Buffalo running "12+ plays in 90
seconds" late in the Week 5 game. Pulled real per-play clock timestamps from
every processed play-by-play transcript this season (`game-notes/*_broadcast_
playbyplay.txt` — Weeks 1-4 and 6; Week 5's raw transcript wasn't saved that
week) and computed the elapsed game-clock time between consecutive plays.

- 685 plays, 5 games.
- **Median time between plays: 7 seconds.** Mean 25.5s (skewed by the upper
  cluster below).
- Distribution is sharply **bimodal**, not a bell curve around a realistic
  ~25-30s NFL average:
  - 0-10s: 375 plays (54.7%)
  - 10-40s: 23 plays (3.4%) — this middle band is nearly empty
  - 40-90s: 292 plays (42.6%)
- 50 separate stretches of 3+ consecutive sub-10-second plays found across
  the 5 games. Only 12 of those 50 (24%) occurred in a genuine late-game /
  2-minute-drill situation where real hurry-up would be expected. The other
  38 (76%) happened in ordinary game flow with no clock pressure at all —
  e.g. a 14-play, 50-second stretch in Week 1 starting at 1:28 in the
  **first** quarter.

That last point mattered: it ruled out "the hurry-up AI is triggering too
often" as the explanation before even reading the source, since most of the
rapid clusters happen nowhere near a hurry-up situation.

## Root cause, found in `src/worker/core/GameSim.football/index.ts`

Every simulated play resolves to a `dt` (seconds of _live action_, e.g. snap
to whistle) which gets a **separate, additional** dead-clock time
(`dtClockRunning`) tacked on **only if the clock was left running** after the
previous play. `this.clock` is tracked in minutes; raw-second constants get
`/60`'d into that unit throughout.

### 1. The dead-time formula is a hard binary switch, not a distribution

`index.ts` ~line 1199-1215:

```ts
let dtClockRunning = 0;
if (this.isClockRunning) {
	if (this.hurryUp()) {
		dtClockRunning = random.randInt(5, 13) / 60;
		if (this.clock - dt - dtClockRunning < 0) {
			dtClockRunning = random.randInt(0, 4) / 60;
		}
	} else {
		dtClockRunning = random.randInt(37, 62) / 60;
	}
	dtClockRunning /= g.get("pace");
}
```

There is no code path that produces something like 15-35 seconds of dead
time between plays — it's either the hurry-up branch (5-13s) or the normal
branch (37-62s). `hurryUp()` (line ~620) is itself correctly gated to real
late-game situations (`this.clock <= 2` and trailing/tied in the final
period), so this binary switch by itself doesn't explain the 76% of rapid
clusters that happened in normal game flow — see next section.

### 2. Whether the clock keeps running at all is a per-outcome coin flip

`Play.ts` ~line 715-827 — after each play resolves, `state.isClockRunning`
gets set based on the specific outcome:

| Outcome                         | P(clock keeps running)                |
| ------------------------------- | ------------------------------------- |
| Completed pass                  | 75%                                   |
| Run                             | 85%                                   |
| Sack                            | 98%                                   |
| Incomplete pass                 | 0% (always stops)                     |
| Interception / fumble lost      | 0% (always stops)                     |
| Fumble recovered by own team    | 95%                                   |
| Any score (TD/FG/XP/2pt/safety) | 0% (always stops)                     |
| Kneel                           | handled separately, not via this flag |

When the clock is stopped going into a play, `dtClockRunning` is skipped
entirely (stays `0`) — the only time that elapses is that play's own live
-action `dt`, which is small by design:

- Run: `random.randInt(2, 4) + Math.abs(yds) / 10` seconds (`index.ts` ~2729)
- Pass (base dropback time, before completion/incompletion adds yardage
  time): `random.randInt(2, 6)` seconds, `+= Math.abs(yds) / 20` regardless
  of whether it's caught (`index.ts` ~2436, ~2521)

So a string of incompletions, or a completion that goes out of bounds, or a
run that goes out of bounds, chains together with almost no dead time added
between them **by design**, independent of hurry-up logic entirely. That's
the actual mechanism behind the 76%-normal-game-flow rapid clusters, and
almost certainly behind the 54.7%-of-all-plays-under-10-seconds headline
number. This is also almost certainly what Michael's post-season "the clock
sometimes only ticks off 3 or 4 seconds" observation is pointing at — the
~2-6s pass `dt` / ~2-4s run `dt` floor, unpadded by any `dtClockRunning` on a
stopped-clock outcome.

## What still needs checking before recommending a specific fix

- Whether this league's simulated incompletion rate / OOB rate is itself
  realistic (if pass attempts are incomplete far more than real NFL's
  ~35-40%, that alone inflates the "clock stopped" share independent of the
  formula above).
- Whether the 37-62s "normal" dead-time band and the pace-divisor combine to
  match real NFL average time-of-possession per drive when only counting
  clock-running plays.
- Real NFL play-to-play timing isn't a smooth bell curve either (stopped-clock
  plays genuinely do produce small deltas in real broadcasts too) — the
  question isn't "should there be any bimodality," it's whether _this much_
  mass sits in the sub-10s bucket and whether the empty 10-40s middle band is
  really empty in real football or just under-sampled in this write-up.
- League-wide, in-sim plays/game vs. real NFL: this league averages 60.9
  plays/team/game (60.4 excluding OT) against a std dev of ~7.9, vs. real
  NFL teams clustering more tightly in the low-to-mid 60s (e.g. Chicago:
  64.5 in 2023, 62.65 in 2024). The average isn't far off; the spread and
  the _shape_ of what produces that average are the parts that look off.

## Source files referenced

- `src/worker/core/GameSim.football/index.ts` — `hurryUp()` (~620),
  main play loop / `dt` and `dtClockRunning` computation (~1015-1243),
  `doPass()` (~2356), `doRun()` (~2602).
- `src/worker/core/GameSim.football/Play.ts` — per-outcome
  `isClockRunning` assignments (~715-827).

## Follow-up, 2026-08-26: live play-by-play confirms the mechanism

Separate complaint, same root cause: a team driving in the final minute
appeared to "get out of bounds" (stop the clock without burning a timeout)
90%+ of the time. Reconstructed one full TB drive from a live game log
(clock 2:07 → 0:42, chronological) and matched every clock-stop to a
specific code path:

- Every stoppage was either (a) an **unconditional** event — incomplete
  pass, a penalty (`Play.ts` `penalty` handler, always sets
  `isClockRunning = false`), the forced two-minute warning — or (b) an
  **explicit offensive timeout**, clearly labeled in the log (all 3 were
  burned over the course of the drive).
- Not one play in the transcript showed the _random_ 15%/25%/2%
  (run/completion/sack) "clock stops with no timeout and no incompletion"
  roll actually firing. The two clean completions with no accompanying
  timeout (2:07 and the final 0:55 snap, which had 0 timeouts left) both
  left the clock running, consistent with the 75%-keep-running default.
- Confirmed directly in this transcript: `dt` (live-action time) is charged
  on _every_ play regardless of outcome — e.g. incomplete-pass gaps in the
  log were consistently ~3-6s (matches the ~2-6s pass `dt` alone, huddle
  term skipped), while plays where the clock kept running under `hurryUp()`
  showed ~12-13s gaps (matches `dt` + the 5-13s huddle band). So `dt` isn't
  being silently dropped anywhere in the hurry-up path — the smallness is
  the ~2-6s constant itself, not a missing term.

This doesn't change the diagnosis above, it's independent confirmation from
a real transcript rather than the aggregated 5-game stats. It also shows the
felt "too fast" problem in hurry-up specifically is the **combination** of the
already-small base `dt` (2-6s pass, 2-4s+dist/10 run) stacking with the
already-small 5-13s huddle band, not either term being literally zero.

## Re-run, 2026-09-08 (post-season): pattern confirmed, three new mechanisms

Re-ran the per-play-gap analysis on a fresh, larger, later-season sample:
**Weeks 14-19 (the last six regular-season weeks) plus all four playoff
games (Wild Card through Super Bowl)** — 10 games, 1,498 play headers,
**1,458 measured gaps**, roughly double the original sample. Method
unchanged: elapsed game clock between consecutive play headers, pairs
spanning a quarter boundary excluded.

### It's still feast or famine, and the numbers barely moved

| Sample                     | Games  | Gaps      | Median | Mean      | 0-10s     | 10-40s   | 40s+      |
| -------------------------- | ------ | --------- | ------ | --------- | --------- | -------- | --------- |
| Original (Wks 1-6)         | 5      | 685       | 7s     | 25.5s     | 54.7%     | 3.4%     | 42.6%     |
| Regular season (Wks 14-19) | 6      | 878       | 7s     | 24.1s     | 55.7%     | 4.8%     | 39.5%     |
| Playoffs (Wks 20-23)       | 4      | 580       | 7s     | 24.1s     | 56.2%     | 5.3%     | 38.4%     |
| **Combined (new)**         | **10** | **1,458** | **7s** | **24.1s** | **55.9%** | **5.0%** | **39.1%** |

Identical median (7s) and identical mean (24.1s) in the regular-season and
playoff halves, and both within a point of the original early-season sample.
The empty middle band persists: only 5.0% of all plays land in the 10-40s
range where a realistic majority should sit. **This is structural, not a
sampling artifact or an early-season fluke.** Longest observed run: 14
consecutive sub-10s gaps burning 53 total seconds of game clock (Week 16 at
New England, 1:37 → 0:48 of the 4th) — a legitimate hurry-up window, but 14
plays including two kickoffs inside 53 seconds is not a realistic pace.

### Resolved: the out-of-bounds constants are firing exactly as coded

One of the open questions above was whether the 15%/25%/2% clock-stop rolls
were realistic _or even accurate_. Measured empirically by taking every
sub-10s gap following a run or completion and subtracting the ones with an
explicit clock-stopping cause in the transcript (score, penalty, timeout):

- **Runs:** implied clock-stop rate **14.8%** (code nominal: 15%)
- **Completions:** implied clock-stop rate **25.1%** (code nominal: 25%)

So the sim is doing precisely what the source says. Whether 15%/25% is
_realistic_ is still a design question, but it is no longer a correctness
question — the rolls are not misfiring, and this line of inquiry can be
closed.

### Gap size by play outcome (combined sample)

| Outcome          | n   | % of plays | Median | Mean  | % sub-10s |
| ---------------- | --- | ---------- | ------ | ----- | --------- |
| Run              | 501 | 34.4%      | 46s    | 36.2s | 32%       |
| Completion       | 391 | 26.8%      | 41s    | 31.0s | 42%       |
| Incompletion     | 228 | 15.6%      | **5s** | 4.7s  | **100%**  |
| Kickoff          | 94  | 6.4%       | **2s** | 1.8s  | **100%**  |
| Punt             | 71  | 4.9%       | 8s     | 8.3s  | 77%       |
| Sack             | 50  | 3.4%       | 48s    | 40.2s | 18%       |
| Pre-snap penalty | 37  | 2.5%       | **0s** | 0.0s  | **100%**  |
| Field goal       | 33  | 2.3%       | 5s     | 4.9s  | 100%      |
| Interception     | 23  | 1.6%       | 5s     | 4.4s  | 100%      |
| Fumble           | 21  | 1.4%       | 6s     | 19.0s | 67%       |
| Kneel            | 9   | 0.6%       | 42s    | 41.6s | 0%        |

The bimodality is fully explained by composition: **33.3% of all plays are
outcome types that structurally never charge dead time** (incompletion,
kickoff, punt, interception, field goal, pre-snap penalty). Runs and
completions — the two types that _do_ usually charge the 37-62s huddle —
sit at a healthy 41-46s median. There is no single broken formula; there's
a third of the play population that skips the dead-time term entirely.

### New mechanism 1: kick and punt returns never set `isClockRunning`

`Play.ts` ~line 744-760 — the `kr` (kick return) and `pr` (punt return)
event handlers **only update `state.scrimmage`**. Unlike the `rus` handler
immediately below them (`state.isClockRunning = Math.random() < 0.85`),
neither ever assigns `isClockRunning` at all:

```ts
} else if (event.type === "kr") {
    state.scrimmage += event.yds;          // no isClockRunning assignment
} else if (event.type === "pr") {
    state.scrimmage += event.yds;          // no isClockRunning assignment
}
```

The per-outcome table in the earlier section of this document lists only
completed pass / run / sack / incomplete / INT / fumble / score / kneel —
`kr`/`pr` were missing from it precisely because they never touch the flag.
Empirically the flag ends up **false** after every return: kickoffs measured
100% sub-10s at a 2s median, punts 77% sub-10s at 8s.

In real football, a kickoff or punt return tackled in bounds leaves the game
clock **running**, and the receiving team then burns ~40 seconds huddling
before the next snap. Here the next snap comes ~2 seconds later. Kickoffs
and punts together are **11.3% of all plays**, so this alone accounts for a
large share of the sub-10s mass, entirely separately from the incompletion
issue already documented above.

### New mechanism 2: kickoff `dt` ignores everything but return distance

`index.ts` `doKickoff()` ~line 1533 initializes `let dt = 0`, and then:

- **Touchback branch:** `dt` is never assigned — stays `0`. (Worth noting
  this one is arguably _correct_ under real rules: on a touchback the game
  clock doesn't start until the next snap. The problem is the flag above,
  not this.)
- **Return branch:** `dt = Math.abs(returnLength) / 8` — the only time
  charged is return distance at 8 yards/second. A 16-yard return costs 2
  seconds of game clock, which is what the 2s median reflects.

8 yd/s is near a sprinter's peak speed and ignores the standing start, the
catch, blocking and the tackle. Real kick returns run closer to 5 yd/s over
the whole play. This is an isolated, low-risk constant to adjust.

### New mechanism 3: pre-snap penalties consume zero game clock

The 37 plays in the "pre-snap penalty" row are false starts, delay of game,
neutral zone infractions and encroachment. Every single one shows a **0-second**
gap. Delay of game is the glaring case: by definition the play clock just
expired, which in real football burns up to 40 seconds of game clock when
the clock was running. Charging zero is wrong on its own terms, independent
of the huddle-time question.

Analysis scripts for this re-run live in a session scratchpad
(`play_gap_analysis.py`, `play_gap_refine.py`; as of 2026-09-10 still at
`%TEMP%\claude\C--claude-projects-zengm-press\64c6676c-3b3f-4e8e-b783-dcbc9bd9593d\scratchpad\`,
a temp directory that can be cleared at any time) — they parse the processed
`game-notes/*_broadcast_playbyplay.txt` transcripts directly and can be
re-pointed at any week range. Note the Week 20 (Wild Card vs. Dallas)
transcript only exists in backward form in `game-notes/archive/`; it was
reversed into the scratchpad for this analysis rather than being added to
`game-notes/`.
