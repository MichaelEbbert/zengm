# Real NFL Draft Classes -- Rebuilding Ratings

Goal: an FBGM league populated only by real NFL players, entering through
their real drafts, with draft-time ratings that put each player on a path
that roughly matches his real career -- Hall of Famers can reach 90+,
long-career starters 60-89, short-career players stay under 40.

---

## RESUME HERE (last updated 2026-10-14)

If you are picking this up on another computer or in a new session, read
this section first, then "Decisions made" and "Next step" below.

### Where things stand

- **71 draft class files** in `draft_classes/` at the repo root:
  `1954draft.json` .. `2024draft.json`, **named by the engine's draft year**
  (`{N}draft.json` = the real NFL draft held in N+1). 17,470 players, all
  `real: true`.
  - `1954`-`1965` (real 1955-1966 drafts): built by us from Wikipedia,
    3,828 players, placeholder ratings, no `srID`.
  - `1966`-`2024` (real 1967-2025 drafts): the fan files from
    TheeGreenGenie/FootballGMLeagues, 13,642 players (13,589 original + 53
    undrafted we added), templated ratings, `srID` = PFR ID on the originals.
- **Every rating in every file is a placeholder.** The user's direction:
  "we'll be overwriting every ability of every player" -- don't spend effort
  tuning current ovr/pot. Files only need correct players, years, positions,
  and a valid format.
- **Committed and pushed 2026-10-13:** all 71 class files, this doc,
  `scripts/`, `data/`, and the Kicker Check in `CLAUDE.md`. Only
  `docs/real_draft_classes/draftclasses/` (the untouched fan originals,
  re-downloadable from the fan's GitHub) is gitignored.
- `src/ui/views/DeleteOldData.tsx` (safer Delete Old Data page) was left
  uncommitted -- check `git status`.

### Next step (agreed)

**Rate QBs one attribute at a time, from real stats, on a bell curve,
through "The interactive loop" below.** Start with `tha`, then the rest of
the important QB ratings (`thp`, `thv`, `bsc`, `spd`, `elu`, `stre`, `endu`,
`hgt`). Plan details in "Quarterbacks -- rating-by-rating plan".

- **Data source decided (2026-10-13): Claude-in-Chrome on Pro Football
  Reference.** Pulled 2026-10-13: every passer, every season, NFL 1955-2025 +
  AFL 1960-69, in `data/pfr_passing.csv` (7,260 rows, PFR id per row). How:
  `fetch()` the season pages from inside a PFR tab (same origin, passes
  Cloudflare), parse, then save one CSV via a blob download -- the JS tool
  returns only ~1,000 chars, so don't pipe data back through it. Needs Chrome
  enabled in Claude Code (`/chrome` -> "Enabled by default", then restart).
- **QB `tha` DONE (rewritten in all 71 files 2026-10-13 with the under-50
  rule and recent-class scatter, uncommitted).** `node
scripts/rateQb.cjs --rating tha --write` (scripts must be `.cjs`, the repo
  is ESM), then `npx oxfmt draft_classes`; per-QB list in `data/qb_tha.csv`.
  780 QBs: 508 rated from 50+ attempts, 272 no-career (46, recent classes
  scattered 36-60). Stored ovr/pot in the files are stale -- expected until
  every rating is rebuilt.
- **Craig Erickson's 1990draft.json entry deleted** (user, 2026-10-13); he
  stays in 1991draft.json (his real 1992 Bucs pick).
- **QB `thp` DONE (written to all 71 files 2026-10-13, uncommitted)**, with
  real heights/weights for 709 QBs (`--write-size`; bio `hgt`/`weight` only,
  not the `hgt` rating). Stat: 80% yards per completion vs league -- from
  2018 completed air yards per completion (`data/pfr_air.csv`, PFR advanced
  passing; drops YAC) -- weighted/shrunk by completions (k 240), + 20% size.
  No-career spread 39-54 around 47 by size. Pins (in `PINS`, rateQb.cjs):
  Mahomes 85, Herbert 85 (elite arms, short offenses), Montana 50, Purdy 75.
  Winston #1 (100): most aggressive deep thrower; rank-based, so #1 gets
  ~100 regardless of margin (user aware). Real sizes from
  `data/pfr_qb_size.csv` (13 pre-1967 no-career QBs found via PFR draft
  pages; 71 unknown = average size; Jeff Rowe from the 2007 Combine page).
  PFR Combine pages (`/draft/YYYY-combine.htm`, 1987+) have 40 times for
  `spd`.
- **QB `thv` DONE (written 2026-10-13, uncommitted).** Blend (user): INT
  rate 50% (lower better) + TD rate 30% + sack rate 20% (sacks/(att+sacks),
  lower better), each vs league per season, shrunk k 400 attempts,
  standardized across QBs, then blended; careers without sack data (pre-1960
  seasons) blend INT/TD only. Engine curve is low at draft (mean 38.6, SD
  12.9 -- vision develops), so top is ~80 (Rodgers), no-career 30. Top ten:
  Rodgers, Montana, Brady, P. Manning, Marino, Brees, Mahomes, Staubach,
  Jurgensen/Gabriel. `rateQb.cjs` now takes multi-part ratings (`parts` in
  `STATS`). Known shape: the no-career block fills ~7-42nd percentile, so
  played-but-bad QBs land below it (0-19) -- intended (busts unappetizing).
- **Floors (user, 2026-10-13):** every rating's curve is cut at the
  engine's lowest draft-time value for it (`floor` in `STATS`): QB tha 18,
  thp 17, thv 14, bsc 7. A bust is bad, not absurd. **Ask the user before
  any floor above 40** (the script refuses without `--floor-ok`). All four
  QB ratings written with their floors.
- **QB `bsc` DONE (written 2026-10-13, uncommitted):** fumbles per play
  handled (passes + sacks + rushes) vs league, lower better, shrink k 1000
  plays (fumbles are rare). Data: `data/pfr_rushing.csv` (every rusher,
  NFL 1955-2025 + AFL 1960-69, 34,099 rows; fumbles complete back to 1955;
  also feeds spd/elu/stre and RBs later). Top: Bert Jones 74, Flores,
  Brodie, Tarkenton, Montana, P. Manning; bottom: Culpepper, RG3, Fields,
  McCown. 27 QBs sit on the floor (7).
- **QB `spd` DONE (written 2026-10-13, uncommitted):** Combine 40 time 60%
  - rushing yards per carry 40% (vs league passers, shrink k 100 carries);
    a QB with a 40 but no career is rated from the 40 (user). 40 times:
    `data/pfr_combine_qb.csv` (PFR, 2000-2025, PFR ids; also vertical/broad/
    cone/shuttle) + `data/nflcombine_qb_1987_1999.csv` (nflcombineresults.com,
    matched by year + name; PFR's Combine pages start in 2000). Close-out
    plays (kneels/sneaks) removed before YPC: per win as starter
    (`data/pfr_qb_rec.csv`), 0.7/win at -1.2 yd from 1990, 0.7 at -0.3 yd
    1979-89, 0.35 at +0.5 yd before 1979 (`CLOSE_OUTS`; `--closeout` scales
    it). The first estimate (1.4/win) over-corrected (Manning 9 -> 59); half
    matches reputations. Sacks are not rushing in NFL stats (they are in
    college). Floor 8. Pins: Vick 95, Lamar 90, Starr 55. **Rewritten 2026-10-13** after
    a fix: rushing league averages now pool only real passers (50+ att), not
    RBs who threw a pass (364 QBs moved, 27 by 5+). Results: Cunningham
    94, Douglass 87, McNair 84 ... Montana 58, Favre 54, Eli 29, Peyton 17,
    Brady 9, Marino 8.
- **Remaining QB ratings -- user's direction (2026-10-13), weights still
  to confirm at each gate 1:**
  - `elu` DONE (written 2026-10-13): rush attempts per game 40% + rushing
    first downs per carry 30% (`data/pfr_rush_fd.csv`, from 1977) + sack
    rate 30% (lower better); under 100 carries with first-down data ->
    60% volume / 40% sack rate. No Combine drills. Close-outs removed;
    rushing league averages pool only 50+ att passers. Floor 3. Pins:
    Brady 30 (sneak first downs), Vick 70, Lamar 70. Top Allen 71.
  - `stre` DONE (written 2026-10-13): rushing TDs per carry 50%
    (close-outs removed) + weight 40% + height 10%, weight/height compared
    within the QB's draft decade (QBs gained ~26 lb 1950s -> 2000s). No
    sack resistance. **Mapped onto the engine's own QB values
    (`empirical: true`), not a bell curve** -- the engine's stre is
    lopsided against 0; the bell curve put 9% at 0, this puts 4% (engine
    3.4%). Top capped at the engine max 38 (user). No-career QBs spread by
    size in percentile space. Pins: Lamar 30, Roethlisberger 36.
  - `endu` DONE (written 2026-10-14): endu does almost nothing for a QB
    (no rotation, not in QB ovr, not tied to injuries; engine QB endu is
    uncorrelated with his other ratings). Derived: career length 40%
    (first to last season; QBs active in 2025 get at least the average
    finished career, 8.2 yrs) + stre 35% + weight 25% (within decade).
    Empirical engine mapping, floor 1. No-career QBs spread by weight only.
    Starts per season was considered and dropped (backup years read as
    injury).
  - `hgt` DONE (written 2026-10-14): absolute real height ranked onto the
    engine QB curve (49.2/13.5), ~8 points per inch (6'2" 43, 6'4" 61);
    unknown height (71 pre-1967 no-career QBs) sits in the middle (48).
    Floor 14. Fix found here: the no-career block could split a run of
    tied scores; it now snaps to a tie boundary (changed one spd value,
    Chuck Clements 30 -> 42, rewritten).
  - Seeded ratings DONE (written 2026-10-14): `scripts/seedQb.cjs` copies
    all 12 (rtr hnd rbk pbk pcv tck prs rns kpw kac ppw pac) from one
    engine-generated QB (`data/qbdraft_seeded.csv`, 174 QBs) picked by a
    seeded hash of file + name; means/SDs match the engine's.
- **METHOD CHANGE (user, 2026-10-14) -- applies to every rating, every
  position: rank, then map onto the engine.** Step 1: the stat only
  decides the ORDER (who is #1, #2 ... #780). Step 2: the QB at percentile
  p gets the value of the engine-generated QB at percentile p. So each
  rating has the engine's exact shape -- its floor, its share at the
  floor, its cap (the engine's max; players grow past it with coaching),
  its lopsidedness. No bell curves. Engine sample: `data/qbdraftratings.csv`
  = every engine-generated QB's draft-time row (first ratings row, season
  = draft year, `real` = 0; league-start players excluded) from all four
  league DBs: 620 QBs. No-career QBs keep their block at the 25th
  percentile but are ORDERED INSIDE IT BY REAL DRAFT POSITION (round, pick;
  undrafted last) -- e.g. QB tha 1st-2nd rounders 50-51, rounds 10+/UDFA
  32-40. This replaced the recent-class random scatter and the size spread
  for no-career QBs. Pins still apply on top (Vick spd 95 exceeds the cap).
  All nine stat ratings rewritten this way; seeded ratings rebuilt from the
  620-QB sample (`seedQb.cjs` now reads `qbdraftratings.csv`).
- **ALL QB RATINGS DONE (2026-10-14, uncommitted).** 779 QBs (780 before Watson was removed) x 21 ratings,
  plus real bio height/weight. `rateQb.cjs --rating X` reproduces every
  stat-based rating exactly (verified for all nine).
- **OVR FIT DONE (written 2026-10-14).** Each rating matched the engine
  alone, but real QBs are good at everything at once: 24 QBs had draft ovr
  80+ (engine: 2 of 620) and 31 pot 100. `scripts/fitOvr.football.test.ts`
  keeps an ORDER and gives the QB at percentile p the engine QB ovr at
  percentile p, reached by one shrink factor per QB: tha/thp/thv/bsc/elu
  move toward the engine QB mean; stre 3x and only down (its ovr weight is
  mostly the athleticism composite, which the game sim never uses); spd 2x
  and only down for pocket passers (runners = engine 80th pct+ spd or elu
  get 1x toward the mean); never below the engine min; hgt (a measurement),
  endu (not in QB ovr) and pinned ratings untouched. ORDER = "game key":
  passing 6 : scrambling 1 (mean of the passing composites x6 + rushing
  composite) -- the user's 3:1 was tested and weighted mobility MORE than
  ovr does (~9:2 incl. athleticism); ovr itself ranked slow passers (Brady)
  low via athleticism. Result: Herbert 85, Allen 82, P. Manning 79,
  Staubach 74, Culpepper 72, Lamar 71 ... Brady 68 (#12). Rams starters
  52-58 (#43-#117). Then `scripts/ovrPot.football.test.ts` recomputed
  ovr/ovrs/pot/pots/skills/draft.ovr/pot with the engine's own functions
  (pot = potEstimator + seeded -2..+2, never below ovr, max 100). Now: ovr
  80+ 2, pot 100 3, mean ovr 40.8 (engine 40.9), mean pot 55.0 (engine
  58.4).
- **WHY the stored ovr/pot matter:** on upload the engine KEEPS a file's
  ovr/pot when present (`augmentPartialPlayer.ts`), so they must be
  recomputed after ANY rating change.
- **QB pipeline order (rerun all after any change):** `rateQb.cjs --rating
X --write` for each of the nine -> `seedQb.cjs --write` ->
  `fitOvr.football.test.ts` (REAL_DRAFT=1 REAL_DRAFT_WRITE=1) ->
  `ovrPot.football.test.ts` (same env) -> `npx oxfmt draft_classes`. After
  the fit, file ratings no longer equal rateQb's output -- expected.
- **Note:** the engine regenerates a player's bio weight each season from
  his hgt/stre ratings (`develop.ts`, +/-10 lb per year), so real weights
  drift after upload.
- **No-career BAND (user, 2026-10-14, written to all 71 files, all nine
  ratings, uncommitted):** the solid no-career block made a cliff -- a
  played QB at its edge jumped all ~270 no-career QBs on a tiny score
  change (+/-19 thp swings). Now no-career QBs get stand-in scores spread
  evenly over +/-0.5 SD (of played-QB scores) by draft position (best pick
  highest; undrafted tied at the bottom), centered so the median no-career
  QB still sits at the 25th percentile, and all 780 are ranked together.
  `rateQb.cjs --band x` (default 0.5; `--band none` = old block). Result
  after fit: mean ovr/pot unchanged (40.8/55.0), no-career ovr 11-48 median
  31 vs played 45; 418 QBs changed ovr, 5 by 5+ (Quinn 31->37, Mack
  Reynolds 20->12, Bryce Young 37->33). Apply the same band at every
  position. All four scripts take `REAL_DRAFT_CLASSES=<dir>` to run the
  whole pipeline on a copy for dry runs.
- **`thp` size now compared within draft decade (user, 2026-10-14,
  written, uncommitted)**, like stre/endu; default in rateQb.cjs
  (`--size-abs` = old pooled way). Effect after fit: 1950s-70s QBs about
  +1 thp, 1990s-2010s about -1; ovr within +/-0.4 per decade; e.g. King
  Hill thp 44->52, Brodie 37->44, Brees 57->53.
- **Deshaun Watson removed from 2016draft.json (user, 2026-10-14).** 779
  QBs now. Removing him nudged rank rounding: Manning and Allen swapped
  the #2/#3 ovr slots (Manning 82, Allen 79); 47 others moved 1.
- **RBs DONE: overnight run approved by the user and WRITTEN to all 71
  files (2026-10-14, uncommitted).** 2,198 RBs; the written ratings match
  the dry run exactly, and no non-RB player changed. Decisions, data files,
  scripts and flags are in `scratch_rb_progress.md` ("Morning summary");
  tier samples in `data/rb_dryrun_report.txt`. Scripts: `rateRb.cjs`,
  `seedRb.cjs`, `runRb.sh`; `fitOvr` now takes `REAL_DRAFT_POS`. To rerun:
  `bash scripts/runRb.sh /c/claude_projects/zengm/draft_classes` (the
  script cds into `scripts/`, so a relative path must be
  `../../../draft_classes`), then `npx oxfmt draft_classes` from the repo
  root. Next: the next position, same interactive loop.
- **Next (QBs):** QBs are done. (1) the next position, same interactive loop (rank by stat,
  map onto the engine, then fit ovr, then ovr/pot).
  - `stre`: rushing TDs (short-yardage proxy), weight, sack resistance,
    height -- decreasing weight in that order.
  - `endu`: starts per season (= injury resistance), skipping a rookie
    season with under 9 starts; spread only +/-2 SD around the mean (it
    barely matters).
  - `hgt`: real height on the engine's QB curve.
  - Seeded (rtr, hnd, rbk, pbk, pcv, tck, prs, rns, kpw, kac, ppw, pac):
    random, as for an engine-generated QB.
- **Measure the engine's draft-time distribution** for each QB rating (done
  only for `spd` so far: mean 46.5, SD 14.7) from the engine-generated
  classes in the Goin Fast / Daily / No Help leagues -- the bell curve targets.

Then: **seed the QB ratings that no stat covers** (see "Unused ratings that
must still be seeded"), then repeat the whole process per position.

### The interactive loop (user's rule, 2026-10-13)

**Applies to every attribute of every position**, including the seeded
(no-stat) ratings, not just QBs. Gates, in order. Never skip ahead.

1. **Discuss one zengm attribute for one position at a time**, and **agree
   with the user on which stat(s) rate it** (for a seeded rating, agree on
   the seeding method). Any stat table in this doc is only a starting
   proposal. Don't fetch anything before the stat is agreed.
2. **Only after that, pull the stats** and rate the players. **Always fit
   the bell curve to the engine's own draft-time spread for that rating and
   position** (mean/SD of engine-generated players in the league DBs -- see
   "Engine reference data"); never invent a curve. Then **show a
   sample**: a few players rated high, a few in the middle and a few low,
   each with the stat behind his rating.
3. **Discuss the samples** and adjust the stat, weighting or curve until the
   user is happy.
4. **Ask permission**, then write that single attribute into the JSON
   files for every player at that position in all 71 files. Then start the
   next attribute at step 1.

**Players with no career at that skill sit at the 25th percentile** (user,
2026-10-13), every attribute, every position -- e.g. a QB who never threw an
NFL pass gets `tha` 46, not the middle. Goal: make them unappetizing in the
draft. Mechanically they're a band (+/-0.5 SD, ordered by draft position)
centered on the 25th percentile of the rank curve and ranked together with
the played players (2026-10-14; was one solid block), so the overall
mean/SD still match the engine's. (A zero
z-score would read as "average starter" -- league averages are starter
averages -- and put them above two-thirds of the real players.)

- **"No career" = under 50 reps in that skill** (user, 2026-10-13; for QBs,
  under 50 career attempts, for every passing rating). A few passes say
  nothing, and the small-sample shrink would pull them _up_ toward the
  starter-heavy league average. Players stay in the classes (they were
  real picks; deleting thins the draft and invites random fake players) --
  low ratings make the AI skip or cut them.
- **Recent classes are scattered, not flat:** no-career players in files
  2022+ (real 2023-2025 drafts) haven't had their chance yet, so they get
  the no-career value plus a seeded normal draw (SD = half the curve SD, cut
  at +/-1 curve SD). QB `tha`: 36-60 around 46. `--recent` moves the cutoff.

---

## Decisions made (chronological, 2026-10-13)

1. **Source:** use the fan-made classes only as a name / birth year /
   position / real-draft-slot skeleton. Their ratings are templated and
   unusable (see "Source data").
2. **Rebuild ratings from real careers**: career-outcome tiers + per-rating
   stat ladders assigned with bell curves fitted to the engine's own
   draft-time distributions.
3. **Store the class files in `draft_classes/` (committed, not gitignored).**
   The repo is private; IP isn't a concern. The original downloads stay
   untouched in `docs/real_draft_classes/draftclasses/` (gitignored).
4. **File format on disk:** pretty-printed by `oxfmt`. Scripts write compact
   JSON (`JSON.stringify(data)`) and then run `npx oxfmt draft_classes` -- see
   "Formatting" below for why.
5. **All players marked `real: true`** (effects listed under "How FBGM sizes
   and schedules draft classes").
6. **53 undrafted players added** to the 1967+ files (list sources under
   "Source data"). Safeguard: the stat ladders will surface more.
7. **Loading = manual upload per league on Draft Scouting**, NOT an engine
   folder lookup. Reason: only specific leagues should get real classes; an
   auto-load would change every league. Each season the user uploads the new
   class (and can re-check +1 and +2).
8. **Files renamed to the engine's draft year** (shift -1). Before, the file
   year was the real draft year and the user had to remember "tab N, file
   N+1". Now the Draft Scouting tab name = the file name. All year fields
   inside moved together, so uploads give identical ages. Verified: no
   lingering wrong years in any file.
9. **League plan: start in FBGM 1954** (the season before Unitas's rookie
   year) with random players, sim forward in spectator mode with real classes
   uploaded every year, and take over a team at a year the user chooses.
10. **Pre-1967 classes built from Wikipedia** for the real 1955-1966 drafts
    (PFR blocked). Placeholder ratings.
11. **Staubach stays in his real draft** (1964 draft, round 10 ->
    `1963draft.json`), entering for the 1964 season -- the alternate reality
    where he played instead of serving in the Navy.
12. **No forced K/P minimum.** A 3-per-class minimum was built (converting
    late generic picks) and then reverted at the user's request; the classes
    hold only real kickers/punters. A "Kicker Check" routine was added to
    `CLAUDE.md` to watch supply and recommend conversions if needed.
13. **AFL-only players (1960-66 AFL drafts) are not included.** Players taken
    in both drafts are in via the NFL list. Add AFL-only stars by hand if
    wanted (like the undrafted players).
14. **Delete Old Data page made safer** (`src/ui/views/DeleteOldData.tsx`,
    uncommitted): "Are you sure?" listing what's selected, then a second
    dialog that requires typing `DELETE`; all boxes unchecked by default; the
    box-score label now says it deletes ALL box scores (in this fork
    `electron/sqlite.js` `deleteOldData` runs an unfiltered `DELETE FROM
games`; automatic box-score pruning was removed in commit 69afea3eb).
    The engine never runs Delete Old Data on its own -- only the user, from
    `/l/:lid/delete_old_data`.

---

## The league plan (how the files get used)

### Process (agreed)

1. **Create a league starting in FBGM 1954** with random players. Call it
   year 1. League creation generates 20 past random classes and develops them
   in place (`createRandomPlayers.ts`) -- rosters are full of fake players.
2. **Upload the three visible classes** on Draft Scouting: `1954draft.json`,
   `1955draft.json`, `1956draft.json` into the 1954 / 1955 / 1956 tabs.
3. **Turn on Spectator Mode** (League Settings). The AI then runs the user's
   team like every other: drafts, re-signs (no negotiations appear --
   `newPhaseResignPlayers.ts:173-177`), free agency (`autoSign.ts:39`),
   roster size (`checkRosterSizes.ts:231`). **Don't use Tools -> Auto Play
   Seasons** -- it sims through the offseason with no chance to upload.
4. **Sim the season** (a week at a time is fine, to watch for timeouts),
   then the draft (all teams auto).
5. **Every offseason, right after the playoffs** (re-sign players phase,
   which creates the new `season + 3` class), upload `{season + 3}draft.json`
   into the new tab. Miss one and a random class gets drafted.
6. Repeat until the target year, then turn Spectator Mode off.

### Turnover math (measured in Goin Fast)

- Players drafted within the last 10 years are ~93% of rosters; within 12
  years ~99%.
- Initial random players: 1,868 at start -> 132 after 10 years -> 15 after
  12 -> 2 after 14.
- So rosters are almost entirely real ~12 seasons after the first real class
  (a 1954 start -> mostly real by ~1966).

### Legends this start covers (real draft year -> file)

| Real draft | Players                                                                    | File             |
| ---------- | -------------------------------------------------------------------------- | ---------------- |
| 1955       | **Johnny Unitas** (9th round)                                              | `1954draft.json` |
| 1956       | Bart Starr, Lenny Moore, Sam Huff, Forrest Gregg, Willie Davis             | `1955draft.json` |
| 1957       | Jim Brown, Paul Hornung, Sonny Jurgensen, Don Maynard                      | `1956draft.json` |
| 1958       | Ray Nitschke, Jim Taylor                                                   | `1957draft.json` |
| 1960       | Larry Wilson                                                               | `1959draft.json` |
| 1961       | **Mike Ditka**, **Deacon Jones**, Bob Lilly, Fran Tarkenton, Herb Adderley | `1960draft.json` |
| 1962       | **Roman Gabriel**, Merlin Olsen                                            | `1961draft.json` |
| 1963       | John Mackey                                                                | `1962draft.json` |
| 1964       | Charley Taylor, Paul Warfield, Bob Hayes, Roger Staubach                   | `1963draft.json` |
| 1965       | Dick Butkus, Gale Sayers, Joe Namath                                       | `1964draft.json` |

(Bold = the user's original picks. Earlier legends -- Bednarik, Van
Brocklin, Gifford, Marchetti, Night Train Lane -- would need a ~1947 start
and 1948-1953 files, not built.)

### Ideas discussed, not decided

- **Delete non-real players' data later** so only real players carry
  simulated career stats (sim from 1954, then wipe the fake players' stats).
  Would need a custom SQL script (back up first, dry run, user runs it).
  Consequences: orphaned awards, team totals that no longer add up, box
  scores listing deleted players. The safer Delete Old Data page is related.
- **Stats backfill from PFR** for a league started from the fan's
  `base_leagues/` real-roster files (which have no stats history) -- an
  alternative to simming from 1954.
- **Fan `base_leagues/`** (`league1966.json` .. `league2026.json` in the fan
  repo): real-roster league files. `league1966` opens in 1967, 24 teams, 1,359
  players, per-player ratings (Starr 92, Unitas 82, Sayers 83, Butkus 75), no
  stats/history/awards, no Staubach. A copy of `league1966.json` is in
  `data/base_leagues/` (used for birth years / sizes / positions of the
  pre-1967 classes).
- A per-league on/off toggle for auto-loading classes (rejected for now in
  favor of manual upload, could revisit).

---

## Source data

### 1967+ fan files

From https://github.com/TheeGreenGenie/FootballGMLeagues/tree/main/draftclasses,
pulled 2026-10-13. Each file is `{ version, startingSeason, players }`.

What's usable vs not:

- **Usable:** `firstName`, `lastName`, `born.year`, position, and
  `draft.round` / `draft.pick` (the real NFL slot). `draft.pick` is the
  **overall** pick (Cromwell 1977: round 2, pick 31). No duplicate picks.
- **Missing:** the NFL team that drafted each player (`draft.tid` /
  `originalTid` are -1 everywhere). Early classes are partial -- the
  1967-1976 drafts ran ~440 picks but each file holds ~200-235 players; from
  2008 on the files cover nearly the whole draft. **The real 1969 draft
  (`1968draft.json`) has no #1 pick** (O.J. Simpson is missing).
- **Not usable:** the ratings. Templated -- a few ratings share one round
  number, 10+ of the 21 raw ratings are 0, `pot === ovr` for every player.
  `college` is blank; `tid` is -2 (undrafted prospect), `draft.tid` -1. Zeros
  break the sim (a safety with `hnd` 0 catches nothing; `bsc` 0 fumbles
  every recovery), so every rating gets rebuilt.
- **The creator's grade (QBs checked 1967-1977):** one number copied into
  every rating relevant to the position (all 8 QB ratings), and the `hgt`
  rating moves with it (60 -> 37, 46 -> 29), so it isn't real height.
  Outcome-based but reputation-biased: Joe Ferguson and Danny White (3rd
  round) at 60, Steve Grogan (5th) at 59, but Ron Jaworski (MVP, 17 seasons)
  and Vince Ferragamo at 51, below Archie Manning's 60. Stabler: all ratings
  62 -- a low-tech way to push him up. A rough ranking input at most.
- **`srID`** is the Pro Football Reference player ID (Josh Allen `AlleJo02`)
  -- the join key to real stats, AV, Pro Bowls, HOF. Present on the 13,589
  originals only.
- **53 undrafted players added** (`draft.round` / `draft.pick` 0, all 21
  ratings 50, `fuzz` 0, engine ovr/pot, position-median physical size, no
  `srID`). Placed in the class of the draft they went undrafted in (Warner
  1994, Moon 1978, Sam Mills 1981, Cameron Wake 2005 -- real years; files are
  one lower). Sources: Pro Football HOF "Undrafted HOFers", Rick Gosselin's
  All-Time Undrafteds Team, NFL.com's best undrafted players, Stacker's
  undrafted Hall of Famers, Football Perspective's best undrafted since 2002.
  List in `data/udfa.json`.
- **Safeguard -- the stat ladders will surface more undrafted players.** Anyone
  on a stat ladder who isn't in a class file is a candidate: find his class
  (final college season + 1, or the year PFR lists him undrafted), add him
  with round/pick 0, log him here.

Known QB check: Josh Allen is in `2017draft.json` (round 1, pick 7) -> first
season 2018.

### 1955-1966 classes we built (files 1954-1965)

- **Source:** Wikipedia "{year} NFL draft" pages via the MediaWiki API
  (`action=parse&prop=wikitext`). Every pick (240-360 per year, 20-30 rounds)
  plus each page's "Notable undrafted players". Raw wikitext saved in
  `data/wiki/{year}.json` (real draft years), parsed to `data/wiki/picks.json`
  and `data/wiki/undrafted.json`.
- **Two page formats:** per-round wikitables (most years) and
  `{{NFLDraft-row}}` templates (1956, and all undrafted lists). The 1963 page
  uses abbreviations (CB, QB...). HOF rows are highlighted `#FFCC00`, Pro
  Bowlers `#faecc8` -- captured as `flag`.
- **Born, height, weight, position, name** come from `league1966.json` for 841
  players still active in 1967 -- matched by name (or nickname, e.g. "David
  'Deacon' Jones" -> Deacon Jones), real draft year +/-1 (that file's draft
  years are sometimes a year off), and a plausible age at draft (19-27; this
  rejected a wrong "Bill Martin" match). Everyone else: born = file year -
  22, era-typical size by position (QB 73"/195 ... OL 74"/240).
- **Positions:** specific labels map directly (Quarterback -> QB, Halfback /
  Fullback -> RB, Linebacker -> LB, Defensive back -> CB, Kicker -> K, ...).
  The two-way era's generic labels, for unmatched players, split by a stable
  name hash:

  | Label  | Split                 |
  | ------ | --------------------- |
  | Back   | RB 40 / CB 35 / S 25  |
  | End    | WR 45 / TE 20 / DL 35 |
  | Tackle | OL 55 / DL 45         |
  | Guard  | OL 70 / LB 15 / DL 15 |
  | Center | OL 70 / LB 30         |

  Revisit when stats arrive: a "Back" who intercepted passes is a DB, one who
  ran is an RB.

- **Clean-up:** players drafted in more than one year (same name + college,
  16 rows -- e.g. Donnie Caraway 1956/57/58, Buck Buchanan 1962/63) keep only
  their last draft; the 1956 page's duplicate Jim Nelson and pick-number
  typos fixed by renumbering picks in page order; "HOF" suffixes and
  footnote digits stripped from names; nicknames dropped unless the league
  file uses them; Jerry Gustafson (blank position) set to QB.
- **Kickers/punters:** only the real ones -- 22 K and 7 P across the 12
  classes; `1954draft.json` has none. Punters are thin until the 1966+ fan
  files (~2-3 a year). Watch with the Kicker Check (`CLAUDE.md`).
- **Ratings:** placeholder grade by pick slot (64 at #1 down to 48 last,
  +8 HOF, +4 Pro Bowl) copied into the position's relevant ratings, the rest
  0 (same template as the fan files); ovr/pot filled by the engine's `ovr()`
  and `potEstimator`. All to be overwritten.
- **No `srID`** -- needs filling when we get PFR data (match by name + draft
  year + college).
- Draft ages: file year - born; 96% of all players are 21-24 at the draft tab.

### Counts by position (all 71 files)

| Pos | 1954-1965 | 1966-2024 | Total |
| --- | --------- | --------- | ----- |
| QB  | 170       | 611       | 781   |
| RB  | 647       | 1,551     | 2,198 |
| WR  | 318       | 1,643     | 1,961 |
| TE  | 147       | 776       | 923   |
| OL  | 891       | 2,260     | 3,151 |
| DL  | 715       | 2,206     | 2,921 |
| LB  | 268       | 1,854     | 2,122 |
| CB  | 399       | 1,657     | 2,056 |
| S   | 244       | 806       | 1,050 |
| K   | 22        | 143       | 165   |
| P   | 7         | 135       | 142   |

151 undrafted (round 0) in total.

---

## How FBGM sizes and schedules draft classes

**Class size** (`draft/genPlayersWithoutSaving.ts`):
`round(numDraftRounds * numActiveTeams * 7 / 6)` -- about 1/6 of each class
goes undrafted.

| League                | Rounds | Teams | Prospects per class |
| --------------------- | ------ | ----- | ------------------- |
| FBGM default          | 7      | 32    | 261                 |
| 1970 league file      | 7      | 26    | 212                 |
| 1954 start (12 teams) | 7      | 12    | 98                  |

- Existing prospects count toward the total -- the engine generates only
  `size - existing`. The real files are larger than the class size in a
  small league (the pre-1967 files hold 245-364), so no random filler; the
  surplus goes undrafted into free agency.
- **Filler is normal random prospects, not scrubs**, unless more than half
  the class has `p.real` set. Other effects of `real` in football: retired
  real players don't die before 70; a "tragic death" event retires a real
  player instead of killing him; no sons/brothers are generated; `killOne`
  skips them. `realPlayerDeterminism` is basketball-only. **Deaths are random
  engine events**, unrelated to real life.
- **Random positions:** each random prospect is K with probability 1/53 and P
  1/53 (`POSITION_COUNTS` in `constants.football.ts`, a 53-man roster). The
  engine also adds random (non-real) free agents if the whole player pool
  drops below `numActiveTeams * (maxRosterSize + 1)`
  (`freeAgents/ensureEnoughPlayers.ts`) or a team can't fill its roster.

**Schedule:** FBGM always holds three classes -- the upcoming draft plus the
next two (`league/create/addDraftProspects.ts`). Each re-sign players phase
generates the class for `season + 3` (`phase/newPhaseResignPlayers.ts`) and
cuts scouting fuzz on the class two years out by ~30%.

### Upload mechanics

`handleUploadedDraftClass` (`worker/api/index.ts` ~line 2495):

- Keeps players with `tid === -2`; for `version >= 33` files it keeps those
  whose `draft.year === startingSeason` (so those two must match -- they do).
- Deletes the tab's existing prospects, adds the file's players.
- `born.year = draftYear - (startingSeason - born.year)` -- age relative to
  the file is preserved, so uploading into the matching tab changes nothing.
- Recomputes ovr/pot via `augmentPartialPlayer` (runs `develop(p, 0)` only if
  `ovrs`/`pots`/`pos` are missing -- which would re-pick the position from
  ratings, so our files always include them).
- Tops off with `draft.genPlayers` if the file has fewer than the class size.

### Naming (engine draft year)

FBGM's draft closes season N, so its "N draft" is the real NFL draft held in
N+1 (pre-1967 drafts were held in Nov/Dec/Jan; rookies still played the
following season). `{N}draft.json` holds the real N+1 draft.

| FBGM class (Draft Scouting tab)  | Upload                   |
| -------------------------------- | ------------------------ |
| season N                         | `{N}draft.json`          |
| `season + 3`, new each offseason | `{season + 3}draft.json` |

**When building from PFR / Wikipedia, the real N+1 draft goes into
`{N}draft.json`.** Example: `2002draft.json` = real 2003 draft (Carson
Palmer); `1954draft.json` = real 1955 draft (Unitas).

---

## Formatting and file conventions

- Files are `{ version: 69, startingSeason, players }`, pretty-printed by
  `oxfmt` (the pre-commit hook formats staged files anyway).
- **Scripts write compact JSON, then `npx oxfmt draft_classes`.** oxfmt only
  collapses short objects like `"born": { "year": 1996, "loc": "" }` when
  they start on one line; writing with tab indentation leaves them expanded
  and every player shows layout noise in the diff.
- Each player: `born`, `college`, `draft {round, pick (in round for our
files / overall for fan files), tid -1, originalTid -1, year, ovr, pot,
skills}`, `firstName`, `lastName`, `hgt` (inches), `imgURL`, `injury`,
  `injuries`, `pid`, `ratings: [ { 21 raw ratings, pos, ovr, pot, fuzz,
season, skills, ovrs, pots } ]`, `relatives`, `stats`, `tid -2`, `weight`,
  `srID` (fan originals), `real: true`.
- `hgt` rating from inches: `100 * (inches - 64) / 18` (`heightToRating`).
- **Rating writes must be per-rating passes** so each diff shows exactly one
  rating changing.

---

## How FBGM uses ovr and pot (constraints on the plan)

- **ovr is computed** from raw ratings by `ovr()` for the player's position.
  We set raw ratings, never ovr directly.
- **pot is computed, not obeyed.** Football: `pot = potEstimator(ovr, age,
pos) +/- 2` (`player/develop.ts`, `monteCarloPot`), recomputed every season;
  it does **not** steer development.
- **Development is random by age** (`developSeason.football.ts`), the same
  curve for everyone. A pot-90 rookie is likely, not guaranteed, to peak at 90. `spd` change is capped at [-12, +2] per season, with an age penalty of
  -2 at 28-30 and -4 from 31; measured QB `spd` change by age in Goin Fast:
  +0.8 at 21 down to -6 at 31-34. `tha`/`thp` use powerFormula, `thv`/`elu`
  iqFormula (grows faster young).
- The levers we control: **starting raw ratings** and **age**.

## Pipeline (per player, overall)

1. **Career outcome -> tier.**
2. **Tier -> target pot:**

   | Tier                               | Target pot |
   | ---------------------------------- | ---------- |
   | Hall of Fame                       | 90+        |
   | Multiple All-Pro / Pro Bowl        | 80-89      |
   | Long career as a starter           | 60-79      |
   | Journeyman / backup, several years | 40-59      |
   | Played a couple of years and gone  | < 40       |

3. **Ratings from stat ladders** (per rating, bell curve -- the QB plan
   below is the template).
4. **Validate:** combined ovr/pot vs tier; sim a sample through
   `developSeason` and check how often each tier peaks in its band.

## Methods for rating players at draft (blend 2-4)

1. **Position stat ladders** -- rank every season, follow each player's
   ladder position. Ranking within a season normalizes era.

   | Pos   | Ladder stat(s)                                                 |
   | ----- | -------------------------------------------------------------- |
   | QB    | passing yards, TD, passer rating / ANY/A (min. att.)           |
   | RB    | rushing yards, rushing TD, scrimmage yards                     |
   | WR/TE | receiving yards, receiving TD, receptions (targets from 1992+) |
   | CB/S  | interceptions, passes defended (where tracked)                 |
   | LB    | tackles (official from 2001), sacks (official from 1982)       |
   | DL    | sacks (official from 1982), tackles for loss                   |
   | K/P   | FG% and long FGs / net punt average                            |

   Rookie stats mostly measure playing time -- weight peak seasons. Use rate
   stats with minimum-games cutoffs.

2. **Approximate Value (PFR AV)** -- every player-season since 1960,
   including OL. Career AV -> tier; peak 3-season AV -> pot band; first 2
   seasons -> draft ovr.
3. **Accolade tiers** -- HOF, All-Pro, Pro Bowls, seasons as a starter.
4. **Draft slot prior** -- the real pick as a percentile = what scouts saw ->
   baseline draft ovr; outcome -> pot. A 7th-round HOFer = modest ovr, high
   pot.

## Offensive linemen

No individual stats, so a composite:

1. **Accolades** (HOF, All-Pro, Pro Bowls) set the top tiers.
2. **Career games started** -- the main signal below Pro Bowl level.
3. **Team offensive stats credited by games started** -- rushing yards, YPC,
   passing yards, sacks allowed / sack rate, ranked among that season's
   teams, credited by the lineman's share of starts. Tie-breaker only (five
   starters share it; sacks depend on the QB, rushing on the RB -- prefer
   rates). Check how far back team sacks allowed go.

---

## Quarterbacks -- rating-by-rating plan (agreed 2026-10-13) <- NEXT STEP

781 QBs now (611 in the 1966+ files incl. Moon, Warner, Romo; 170 in the
pre-1967 files). Every rating is set the same way: **rank all QBs on one
telltale stat, then assign the rating from a bell curve.**

Every rating below goes through "The interactive loop" (top of this doc).

**Agreed stats (gate 1 passed):**

- `tha` (2026-10-13): **pure career completion % vs league**, the
  per-season z-score weighted by attempts, shrunk toward average for small
  samples -- shrink `z * att / (att + 400)` (user picked 400 over 200/500,
  2026-10-13: puts long elite careers above short ones, e.g. Brees 97 over
  Schonert 82; ranks barely move beyond that). No depth adjustment -- `thp`
  covers deep passing. Curve
  **not capped** at the engine's observed 18-87 (user, 2026-10-13): with 781
  QBs the rank curve runs ~9 to ~102 (#1 ~102, which the engine's 0-100
  rating limit makes 100; #2 ~97, #3 ~95); revisit if the sample shows
  a problem.

### Steps

1. **Pull the stats once, cache them** in `data/` (one row per QB per
   season), so re-ranking never re-fetches. Test on a small sample first
   (e.g. the real 1977 and 2018 classes = `1976draft.json`,
   `2017draft.json`).
2. **Score each QB on one stat at a time**, starting with `tha` from career
   completion %:
   - **Era-adjust with z-scores**, per season `(player - league avg) / league
SD`, combined across seasons weighted by attempts. Converting to today's
     scale ("league average in 1977 reads as 65%") is fine for reading the
     list, but rank on the z-score.
   - **Shrink small samples toward average** by attempts. QBs with no NFL
     passes go to the middle of the curve.
3. **Assign by rank on a bell curve** (deterministic: rank `i` of `N` gets
   `mean + SD * invNorm((i - 0.5) / N)`), **fitted to the engine's
   draft-time QB distribution** for that rating, not prime ratings --
   development carries players up from there.
   - Measured so far (12 engine classes: Goin Fast 1912-1921, Daily 2001, No
     Help 1901; 174 QBs): **QB `spd` mean 46.5, SD 14.7, range 8-87.** Raw
     values in `data/qbspd.csv` (league, draft year, pick, spd).
   - **QB `tha`: mean 55.4, SD 14.5, range 18-87** (same 174 QBs; p10 36,
     median 55, p90 75). Raw values in `data/qbdraftratings.csv` (league,
     draft year, round, spd, tha) -- add new columns there as ratings get
     measured. League DBs on the Windows desktop are under
     `C:\Users\micha\Dropbox\Gaming and Magic and Comics\ZenGM\football\`.
   - **All QB curves (measured 2026-10-13, same 174 QBs, in
     `data/qbdraftratings.csv`):** spd 46.5/14.7, tha 55.4/14.5, thp
     56.7/13.9, thv 38.6/12.9, bsc 31.6/13.3, elu 24.8/14.3, stre 14.6/9.5,
     endu 33.5/14.3, hgt 49.2/13.5 (mean/SD).
   - **Measure every other rating the same way before using it** (query the
     league DBs: draft-time `player_ratings` row of engine-generated QBs).
4. **Review the list standalone** -- rank, name, years, attempts, z-score,
   rating. Spot-check (Montana / Brees / Brady near the top for `tha`, bust
   #1 picks low). Once the user is happy, a script writes that one rating
   into `draft_classes/` (compact, then `npx oxfmt`).
5. **Repeat per rating**, then check combined ovr against career tier.

### Stat per rating

| Rating  | FBGM effect                        | Rank by                                                                            |
| ------- | ---------------------------------- | ---------------------------------------------------------------------------------- |
| `tha`   | completion odds                    | Completion % vs league (`Cmp%+`)                                                   |
| `thp`   | deep passing                       | Yards per completion, `Y/A+`; air yards/att (~2006+); share of 20+/40+ completions |
| `thv`   | reads, target choice, INTs         | `Int%+`, `TD%+`; `ANY/A+` as a cross-check                                         |
| `bsc`   | fumbles                            | Fumbles / (rush att + sacks) -- all fumbles, recovery is luck                      |
| `spd`   | rushing (weight 1)                 | 40 time where it exists (Combine, late 1980s on); else YPC and long runs           |
| `elu`   | rushing (weight 1), avoiding sacks | Rush attempts / game, scramble success -- the "runs smart" production              |
| `stre`  | rushing (weight 0.5), sacks        | Weight; short-yardage and goal-line rushing TDs                                    |
| `endu`  | fatigue (QBs don't rotate)         | Barely matters -- starts per season, or one value for all                          |
| `hgt`   | minor composite input              | Real height, scaled to the QB range                                                |
| (check) | `avoidingSacks` = thv, elu, stre   | `Sk%+` -- sanity check on those three, not a rating                                |

Rushing composite is `stre 0.5 + spd 1 + elu 1`: Josh Allen (big, smart
runner, ~4.75 40) comes out moderate `spd` with high `elu`/`stre`. Top-end
`spd`: the curve gives ~1 QB in the 90s and 8 at 80+; keep SD 14.7 and
hand-pin the 3-5 elite runners (Vick, Lamar Jackson, Cunningham) rather than
widening the curve. Rank-based `spd` buckets for 611 QBs at mean 46.5 / SD
14.7: 0s 4, 10s 16, 20s 56, 30s 118, 40s 161, 50s 141, 60s 79, 70s 28, 80s
7, 90s 1.

Top career QB rushers (for hand-pinning `spd`/`elu`): Michael Vick, Lamar
Jackson, Cam Newton, Randall Cunningham, Russell Wilson, Josh Allen, Steve
Young, Fran Tarkenton, Steve McNair, Donovan McNabb, ... (verify with real
data when pulled).

---

## Unused ratings that must still be seeded

The fan template sets each position's "relevant" ratings and leaves the rest
at **0**. Zeros are not harmless: the engine uses off-position ratings when
a player fills in elsewhere (KR/PR, injury emergencies, fatigue rotation)
and in composites (`hnd` for any ball-handler, `bsc` for any carrier,
`tck` for anyone making a tackle after a turnover). Engine-generated players
never have 0s.

For each position, the ratings no stat covers must be **seeded from the
engine's own draft-time distribution for that position** (random draw or the
position median, from engine-generated classes in the league DBs) -- not
left at 0, not set from stats.

| Pos  | Rated from stats (plan)                             | Must be seeded (no telltale stat)                                       |
| ---- | --------------------------------------------------- | ----------------------------------------------------------------------- |
| QB   | tha, thp, thv, bsc, spd, elu, stre, endu, hgt       | **rtr, hnd, rbk, pbk, pcv, tck, prs, rns, kpw, kac, ppw, pac**          |
| RB   | spd, elu, bsc, stre, hnd (catching), rtr, hgt, endu | thv, thp, tha, pbk/rbk (partly), pcv, tck, prs, rns, kpw, kac, ppw, pac |
| WR   | spd, rtr, hnd, elu, bsc, hgt, stre, endu            | thv, thp, tha, rbk, pbk, pcv, tck, prs, rns, kicking/punting            |
| TE   | hnd, rtr, rbk, pbk, spd, stre, hgt                  | throwing, coverage/defense, kicking/punting                             |
| OL   | rbk, pbk, stre, hgt (composite, see OL)             | spd, elu, hnd, rtr, bsc, throwing, defense, kicking/punting             |
| DL   | prs, rns, tck, stre, spd, hgt                       | pcv, offense, kicking/punting                                           |
| LB   | tck, rns, prs, pcv, spd, stre                       | offense, kicking/punting                                                |
| CB/S | pcv, spd, tck, hnd (INTs), hgt                      | prs, rns (partly), offense, kicking/punting                             |
| K/P  | kpw, kac / ppw, pac                                 | everything else                                                         |

Order of work: QB stat ratings -> QB seeded ratings -> next position.

---

## Data sources

- **Pro Football Reference blocks scripts.** `curl` (even with a browser
  User-Agent) and the WebFetch tool both get **HTTP 403** (Cloudflare) as of
  2026-10-13. Options:
  - **Claude-in-Chrome** driving the user's real browser on PFR pages /
    their CSV export ("Share & Export" -> "Get table as CSV"). Slow but
    PFR-complete (stats back to 1920s, AV from 1960, Pro Bowls, HOF, games
    started, combine). Respect ~20 requests/minute.
  - **nflverse** (`nflreadr` / `nfl_data_py`, GitHub release CSVs) --
    clean season stats, but only 1999+.
  - **Wikipedia** player infoboxes -- career totals only, no seasons; works
    from scripts (the API needs a User-Agent and slow pacing -- 3 rapid
    requests got HTTP 429).
  - Stathead (paid PFR) -- bulk queries.
- Snap counts (nflverse) from 2012 only.
- Pre-1960 seasons have no AV; sacks unofficial before 1982, tackles before 2001.

---

## Engine reference data (league DBs)

League DBs: `D:\Dropbox\Gaming and Magic and Comics\ZenGM\football\`, listed
in `meta.db` `leagues`. sqlite3 CLI:
`C:\Users\Michael\miniconda3\Library\bin\sqlite3` -- always `-readonly`.

| League                   | File                      | Notes        |
| ------------------------ | ------------------------- | ------------ |
| Goin Fast League         | `league-1784584722697.db` | ~1922 season |
| Daily League             | `league-1786126806602.db` | ~2002 season |
| TEST_LEAGUE_1            | `league-1786136738372.db` |              |
| No Help Desktop League 5 | `league-1788549459628.db` | ~1902 season |

Use their engine-generated draft classes (NOT the uploaded real ones) for
the bell-curve targets: the draft-time `player_ratings` row
(`season = draft_year`) of each player, filtered by position.

---

## Files in this folder

- `real_draft_classes.md` -- this doc.
- `draftclasses/` -- untouched original fan downloads (real-year names,
  `1967draft.json` .. `2025draft.json`). Used by `checkYears.js` to verify
  ages after the rename.
- `data/wiki/{1955..1966}.json` -- Wikipedia wikitext for each draft;
  `picks.json`, `undrafted.json` -- parsed output (real draft years).
- `data/base_leagues/league1966.json` -- fan real-roster league (1967 season).
- `data/udfa.json` -- the 53 undrafted players added to the 1967+ files.
- `data/qbspd.csv` -- engine draft-time QB `spd` sample (174 QBs).
- `data/ovr50.json` -- engine ovr/pot for all-50 ratings by position and age.
- `scripts/` (Node, run with `node script.js <args>`):
  - `parseWiki.js <wikiDir>` -- wikitext -> `picks.json` / `undrafted.json`.
  - `buildPre.js <dataDir> <outDir>` -- picks -> placeholder class files
    (expects `<dataDir>/wiki/` and `<dataDir>/bl/league1966.json` -- adjust
    paths to `data/base_leagues/`).
  - `tmpFillPre.football.test.ts.txt` -- the temporary vitest that fills
    ovr/pot fields with the engine's functions (copy into
    `src/worker/core/player/`, run, delete).
  - `shiftYears.js <dir> <outDir>` -- the one-time rename to engine years
    (already applied; don't rerun).
  - `checkYears.js <draft_classes> <draftclasses originals>` -- verifies
    file/draft/ratings years and ages vs the originals (1966+ files only).
  - `markReal.js <dir>` -- sets `real: true` (already applied).
  - `addUdfa.js` -- added the 53 undrafted (ran before the rename, against
    real-year names; historical).
  - `topqb.js <dir> <year> [pos] [n]` -- prints the top-n drafted players at
    a position with their ratings.

---

## Open questions

- **Double-drafted players:** Craig Erickson was in two files (fixed). Check
  other positions the same way (same srID in two files).
- **Listed QB, made it elsewhere:** Logan Thomas (TE), Brad Smith (WR/KR),
  Jerry Reichow (end), Terry Baker (RB) -- rated as no-career QBs. Revisit
  their position when the other positions are rated.
- Target year for the user to take over the league (Staubach era, ~1964+?).
- How variable is `developSeason`? Determines how wide the tier bands should
  be.
- Should draft age shift with tier (younger HOFers for more growth), or stay
  at the real age?
- Whether to add AFL-only players, and 1948-1953 classes for an earlier start.
- Whether to delete non-real players' stats after the sim-forward.
