# Clock and play pacing

**Status: findings only, nothing implemented.** Summary and ranked fixes are in
`FUTURE_PLANS.md`. Moved here 2026-09-10 from `zengm-press`, where it was
written as read-only research on the Daily League's 2001 season. The sections
below are kept as written, including the line numbers of the time; use the
table for current locations. Transcript paths (`game-notes/...`) are relative
to `zengm-press`.

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

## Harness baseline, 2026-09-10 -- the "before" numbers for clock changes

Measured with the sim harness (`src/worker/core/GameSim.football/simHarness.ts`) rather than real games, so any clock change can be re-measured the same way in a minute. 500 games, coach play-calling for both teams, two generated 50-man rosters with real ovrs, neutral site. Re-run with:

```bash
SIM_HARNESS=1 SIM_GAMES=500 SPORT=football npx vitest run --project football src/worker/core/GameSim.football/simHarness.test.ts -t "clock distribution"
```

**The harness matches real games.** Its gap by play type reproduces the 1,458-play real-game sample below almost exactly (medians, harness vs real: run 46s / 46s, completion 42s / 41s, incompletion 4.5s / 5s, kickoff 2.4s / 2s, punt 8s / 8s, sack 51s / 48s, kneel 41s / 42s). Absolute play counts run about 5 per team-game higher than a real league, so compare before/after deltas, not absolute levels.

### Offensive plays per team-game

Runs, passes, sacks and kneels; 1,000 team-games.

| Mean | Min | 10th pct | Median | 90th pct | Max |
| ---- | --- | -------- | ------ | -------- | --- |
| 67.0 | 40  | 56       | 67     | 78       | 100 |

### Time between snaps, hurry-up excluded

A snap is "hurry-up" when its gap came from the 5-13s huddle branch rather than the normal 37-62s one -- `hurryUp()` has a single caller, in that branch, so the flag is exact. Coach desperation mode is **not** excluded; only hurry-up clock timing is. 78,562 gaps, with 1,984 hurry-up gaps (2.5%) left out. Gaps are rounded to whole seconds (5.4s counts in 0-5s, 5.6s in 6-10s).

| Gap    | Count  | Share |
| ------ | ------ | ----- |
| 0-5s   | 34,818 | 44.3% |
| 6-10s  | 14,149 | 18.0% |
| 11-15s | 653    | 0.8%  |
| 16-20s | 81     | 0.1%  |
| 21-25s | 61     | 0.1%  |
| 26-30s | 73     | 0.1%  |
| 31-35s | 79     | 0.1%  |
| 36-40s | 706    | 0.9%  |
| 41-45s | 5,481  | 7.0%  |
| 46-50s | 5,340  | 6.8%  |
| 51-55s | 5,547  | 7.1%  |
| 56-60s | 5,321  | 6.8%  |
| 61-65s | 5,116  | 6.5%  |
| 66-70s | 1,137  | 1.4%  |

**Hurry-up isn't what empties the middle.** With it excluded, only 2.1% of gaps fall between 11 and 40 seconds. The split is stopped-clock vs running-clock plays:

- **0-10s (62%):** plays after which the clock is stopped -- incompletions, kicks, penalties, extra points -- charge only the play's own few seconds.
- **41-70s (36%):** the flat ~7%-per-bin block is `randInt(37, 62)` seconds of dead time, uniform across its range, plus 2-4s for the play itself.

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

## Candidate directions (not vetted, not being implemented)

- Smooth `dtClockRunning`'s hurry-up/normal split into something closer to a
  continuous distribution instead of two hard-coded ranges with an empty gap
  between them.
- Raise the floor on live-action `dt` for stopped-clock outcomes (incomplete
  passes in particular, since those are unconditionally clock-stopping and
  currently contribute almost no time at all — 2-6s base, barely modified by
  yardage).
- Reconsider whether 15%/25%/2% of runs/completions/sacks going out of
  bounds (vs. staying in bounds) is a realistic rate, since that's a second,
  independent lever on how often the dead-time formula gets skipped
  entirely.

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
a real transcript rather than the aggregated 5-game stats. It does sharpen
one candidate direction: the felt "too fast" problem in hurry-up specifically
is the **combination** of the already-small base `dt` (2-6s pass, 2-4s+dist/10
run) stacking with the already-small 5-13s huddle band, not either term being
literally zero. Whoever picks this up should decide, as a first cut, whether
to widen the hurry-up huddle band (5-13s → wider), raise the base `dt` floor
(affects all plays, not just hurry-up), or both — no decision made yet, this
is still evidence-only per the ground rules above.

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

### Updated candidate directions (still not vetted, still not implemented)

Ordered roughly by impact-to-risk, based on the new data:

1. **Set `isClockRunning` on `kr`/`pr` return events** the way `rus` does —
   probably `true` for a return tackled in bounds, with an out-of-bounds
   roll comparable to the run/pass ones. Biggest single win: 11.3% of plays,
   and it's an outright omission rather than a tuning question.
2. **Charge dead time on pre-snap penalties**, especially delay of game.
   Small population (2.5%) but unambiguously wrong at 0s.
3. **Raise the kickoff return `dt` divisor** from `/8` to something nearer
   `/5`, and consider a small fixed catch/setup term.
4. **Raise the base live-action `dt` floor** for stopped-clock outcomes,
   incompletions above all (2-6s currently, 15.6% of all plays) — this is
   the original recommendation and still stands, but note it affects every
   play type, so it's the highest-blast-radius option of the four.
5. Smoothing the binary 5-13s / 37-62s `dtClockRunning` split into a
   continuous distribution remains worthwhile for the empty 10-40s band, but
   the new data suggests it's a _smaller_ contributor than items 1-4: runs
   and completions already median 41-46s, which is in a believable range.

Analysis scripts for this re-run live in a session scratchpad
(`play_gap_analysis.py`, `play_gap_refine.py`; as of 2026-09-10 still at
`%TEMP%\claude\C--claude-projects-zengm-press\64c6676c-3b3f-4e8e-b783-dcbc9bd9593d\scratchpad\`,
a temp directory that can be cleared at any time) — they parse the processed
`game-notes/*_broadcast_playbyplay.txt` transcripts directly and can be
re-pointed at any week range. Note the Week 20 (Wild Card vs. Dallas)
transcript only exists in backward form in `game-notes/archive/`; it was
reversed into the scratchpad for this analysis rather than being added to
`game-notes/`.
