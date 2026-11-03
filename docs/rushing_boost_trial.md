# Rushing Boost Trial -- 2026-11-03

`FUTURE_PLANS.md` item 4. Idea: too many 3-and-outs, so add a boost to the 1st-down run share once the coach's YPC-vs-YPA ratio applies (5 rushes and 5 dropbacks), capped at a 0.90 run chance. Switch: `RUSH_TUNING.runBoost` in `coachDecision.ts` (0 = original).

## Results

15,000 full LAC vs BUF games per setting, both teams on the same setting. A 3-and-out is a drive of 3 or fewer offensive plays that ends in a punt.

| Boost | 3-and-outs per team-game | 3-and-outs per drive | Drives per team-game | Points per team-game | Points per drive | 1st-down run share | All plays run share | Yards per carry | LAC win% |
| ----- | ------------------------ | -------------------- | -------------------- | -------------------- | ---------------- | ------------------ | ------------------- | --------------- | -------- |
| 0     | 1.87                     | 15.8%                | 11.79                | 24.37                | 2.07             | 49.2%              | 36.8%               | 4.96            | 57.8     |
| +0.05 | 1.86                     | 15.9%                | 11.69                | 24.13                | 2.07             | 52.2%              | 38.2%               | 4.95            | 57.6     |
| +0.10 | 1.84                     | 15.9%                | 11.57                | 23.87                | 2.06             | 55.4%              | 39.9%               | 4.96            | 57.1     |
| +0.15 | 1.82                     | 15.9%                | 11.46                | 23.69                | 2.07             | 58.4%              | 41.4%               | 4.94            | 57.1     |

3-and-outs per team-game are good to about +/-0.02.

## Reading

- **The boost doesn't reduce 3-and-outs.** Their share of drives is flat at 15.8-15.9%. The small drop per game comes only from fewer drives.
- **It slows games down.** More runs keep the clock moving, so each team gets about 0.3 fewer drives at +0.15 and scores about 0.7 fewer points. Points per drive don't change.
- **Running doesn't get better.** Yards per carry hold at 4.95, so the extra runs are as productive as the passes they replace, no more.
- The 1st-down run share moves as designed (49% to 58% at +0.15).
