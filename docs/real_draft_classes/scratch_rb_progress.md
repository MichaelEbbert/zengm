# RB overnight run (2026-10-14 night) -- progress log

User asleep; authorized: make decisions like today's QB ones, scrape PFR,
report tomorrow. **STOP AFTER RBs** (user checks the weekly token limit in
the morning) -- do not start another position. NOT allowed without approval: browser downloads (to the
Downloads folder), `rm` with wildcards, commits/pushes, writing the REAL
class files. All rating work runs on a scratch copy via
`REAL_DRAFT_CLASSES=<scratchpad>/rbdry`; the user reviews each attribute
(top/middle/bottom samples) tomorrow, then the approved write is a rerun.

Status line (update as you go): **WRITTEN (2026-10-14 morning) -- user approved the dry run; runRb.sh run on the real draft_classes, matches the dry run exactly. Uncommitted.**

## Morning summary (for the user)

- Report with top/middle/bottom/band/known samples per rating + ovr/pot:
  data/rb_dryrun_report.txt. To write after approval:
  `bash scripts/runRb.sh ../../../draft_classes` (path is relative to scripts/, since the script cds there)
  then `npx oxfmt draft_classes` from the repo root.
- Final dry run: mean ovr 38.5 (engine 38.5), max 78 (engine 79), 0 at
  80+; mean pot 50.6 (engine 52.5); pot 100: 0 (engine 2 of 913).
- Decisions to review: stat per rating (Plan section, with the elu change
  below); shrink k ~500 carries; no-career = under 50 carries (rush
  ratings) / under 50 catches or targets (hnd/rtr -- 63% of RBs land in the
  band); rbk/pbk seeded randomly (no blocking stats); bsc touches include
  kick/punt returns; volume HOFers (Gore #636, Bettis #376, Martin #172)
  rate good-not-great since ratings are per-play quality.
- Flags: Bo Jackson double-drafted (1985 + 1986 files); "Ray Brown" in the
  1955 and 1957 files both matched one PFR player (5 carries, band either
  way); many 1955-66 "RBs" really played DB/LB (two-way-era labels).

## Done

- `data/rbdraftratings.csv`: 913 engine-generated RBs, draft-time row, all
  4 league DBs (same query as the QB file; reproduces the 620 QBs).
- Chrome relaunched (was closed); extension connected.

## Plan

1. Data: PFR receiving per season 1955-2025 + AFL (targets from 1992),
   Combine 40 times for RBs (PFR 2000+, nflcombineresults 1987-1999).
   No downloads: pull filtered text via get_page_text / write CSV with the
   file tools. Rushing (all players) already in pfr_rushing.csv, rushing
   first downs 1977+ in pfr_rush_fd.csv.
2. Script rateRb (generalize rateQb), engine distribution = rbdraftratings.
3. Ratings + stats (decided by Claude, user to review):
   - spd: 40 time 60 / yards per carry 40
   - elu: yards per carry 50 / rushing first downs per carry 50 (YPC only pre-1977)
   - stre: weight (within decade) 60 / rushing TD per carry 40
   - bsc: fumbles per touch (carries + receptions)
   - hnd: catch rate 1992+ / receptions per game
   - rtr: receptions per game 60 / yards per reception 40
   - endu: touches per game 60 / career length 40
   - hgt: real height
   - rbk, pbk + QB/defense/kicking ratings: seeded from one engine RB
4. Fit ovr to the engine RB ovr curve, ovr/pot, report.

## Log

- data/nflcombine_rb_1987_2025.csv: 1,598 RB+FB Combine rows (curl works on
  nflcombineresults.com, no browser needed; has 40, height, weight, drills).
- PFR receiving pull running in-page (window.\_\_rec in the PFR tab).
- data/pfr_rb_rec.csv: 1,660 career receiving lines (one per PFR id) for
  drafted RBs, 1955-2025 + AFL. Pulled in-page (34,099 season rows), reduced
  in the page to career totals; era baselines = drafted-RB seasons with 6+
  games: exp_rec = sum g _ league rec/g, exp_yds = sum rec _ league yds/rec,
  exp_cat = sum tgt \* league catch%. tgt/rec_t only for seasons PFR has
  targets (sparse before 1992). Name-only matches limited to seasons <= 1980.
  Columns: id,name(only for name-matched),first,last,g,rec,yds,td,fmb,tgt,
  rec_t,exp_rec,exp_yds,exp_cat.
- RB bio hgt/weight in the class files are PLACEHOLDERS for most (every
  1970s/80s RB = 73 in / 230 lb). data/nflverse_size.csv: 22,687 PFR ids
  with height/weight (nflverse players.csv, curl from GitHub release).
  Covers RBs 1970+ almost fully; 1950s-60s need PFR player pages.
- scripts/rateRb.cjs written (8 stat ratings + --write-size). Matching:
  srID, else unique name in rushing/receiving with first season within 12
  yrs of the draft, else data/pfr_rb_draftids.csv (68 ids from PFR draft
  pages 1955-66, name-validated; many were two-way-era players who really
  played DB/LB, so no RB career -> band).
- scripts/fitOvr.football.test.ts generalized: REAL_DRAFT_POS=RB orders by
  engine ovr and moves spd elu stre bsc hnd rtr toward the engine mean. QB
  output verified byte-identical to before the change.
- Size pull for 387 pre-1970 ids (PFR player pages, window.\_\_sz) ->
  data/pfr_rb_size.csv (id,hgt_in,weight). If interrupted: redo from
  rb_hgt.csv rows with career==0 and an id.
- rateRb: each "which stats exist" group is rescaled to SD 1 before ranking
  (one-stat players -- pre-Combine backs on YPC only -- otherwise owned both
  ends of spd/stre).
- scripts/seedRb.cjs (13 seeded incl. rbk/pbk) and scripts/runRb.sh <dir>
  (sizes -> 8 ratings -> seed -> fit -> ovr/pot) written. First full dry run
  on scratchpad/rbdry OK: mean ovr 38.5 (engine 38.5), max 78 (engine 79),
  0 at 80+ (engine 0); mean pot 50.5 (engine 52.5); pot 100: 1 (engine 2).
- Shrink k raised (ypc/fdpc 500 carries, tdpc/fumpt 600, recpg 50 g, ypr
  100 rec, catch 150 tgt): with k 150 short careers (Ickey Woods, Hokie
  Gajan, Ernie Green) outranked Payton/Emmitt/LT.
- elu now YPC 35 / first downs per carry 30 / carries per game 35 (era-adj,
  like QB elu's attempts per game). Payton #31, Emmitt #26, Dickerson #32
  of 2198 after fit; Gore #563, Bettis #378 (per-play quality is ordinary
  -- flag for the user: volume HOFers rate good, not great).
- data/pfr_rb_size.csv: all 387 pre-1970 sizes found (PFR player pages).
  Every RB with a PFR id now has a real size (1,841); 357 without an id
  (never played) sit at middle height.
- Returns pull running (window.\_\_ret in the PFR tab) -> data/pfr_rb_ret.csv
  (id,ret = career kick + punt returns); rateRb already reads it for bsc.
- data/pfr_rb_ret.csv: career kick+punt returns for 1,352 RB ids; bsc now
  counts them as touches (Brian Mitchell bsc 3 -> 36).
- Bug fixed: the receiving reduction kept name-only matches only through
  1980, so undrafted moderns (Priest Holmes, Arian Foster, Fred Jackson,
  Willie Parker) and draft-page ids (Timmy Brown) had no receiving; 11
  career lines appended to pfr_rb_rec.csv from the in-page season rows.
- (Resolved) Known issue: bsc fumbles include return fumbles (PFR totals) -> returners
  (Brian Mitchell, Meggett, Milburn) at the bottom. Plan: pull PFR returns
  pages after the size pull and add returns to touches.
- Double-drafted: Bo Jackson in 1985draft (real 1986 R1 TB) and 1986draft
  (real 1987 R7 LAR). Both real picks, left in; flag for the user.
