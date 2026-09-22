import type { PlayerStats } from "./types.ts";

// Fantasy point weights and scoring functions for the "fp" stat in
// processPlayerStats.football.ts. Each line of that formula is one call to a
// function here, so it stays line-for-line with upstream while the scoring
// logic in this file can grow or shrink freely.
// Each comment gives the original/default (upstream) value.

export const FANTASY_POINTS = {
	// Yards needed for 1 point
	passYdsPerPoint: 10, // default: 25
	rushRecYdsPerPoint: 10, // default: 10

	// Points per completion
	passCmp: 0.01, // default: 0 (not scored upstream)

	// Points per touchdown
	passTD: 6, // default: 4
	nonPassTD: 6, // default: 6 -- rushing, receiving
	returnTD: 0, // default: 6 -- punt return, kick return (DST in our schedule)

	// Points subtracted per interception thrown or fumble lost
	turnover: 2, // default: 2

	// Kicking
	xp: 1, // default: 1
	fg0: 4, // default: 3 -- 0-19 yds
	fg20: 4, // default: 3 -- 20-29 yds
	fg30: 4, // default: 3 -- 30-39 yds
	fg40: 4, // default: 4 -- 40-49 yds
	fg50: 4, // default: 5 -- 50+ yds
	fgMiss: 1, // default: 0 (not scored upstream) -- subtracted per missed FG

	// Points per reception, by the league's Fantasy Points setting
	pprRec: 1, // default: 1
	halfPprRec: 0.5, // default: 0.5
};

const FP = FANTASY_POINTS;

export const passingYardsPoints = (ps: PlayerStats) =>
	ps.pssYds / FP.passYdsPerPoint + FP.passCmp * ps.pssCmp;

export const passingTDPoints = (ps: PlayerStats) => FP.passTD * ps.pssTD;

export const rushRecYardsPoints = (ps: PlayerStats) =>
	(ps.rusYds + ps.recYds) / FP.rushRecYdsPerPoint;

export const nonPassTDPoints = (ps: PlayerStats) =>
	FP.nonPassTD * (ps.rusTD + ps.recTD) + FP.returnTD * (ps.prTD + ps.krTD);

// Negative: interceptions thrown and fumbles lost cost points
export const turnoverPoints = (ps: PlayerStats) =>
	-FP.turnover * (ps.pssInt + ps.fmbLost);

export const extraPointPoints = (ps: PlayerStats) => FP.xp * ps.xp;

// One distance tier: makes score by tier, misses (attempts - makes) cost fgMiss
export const fieldGoalPoints = (
	ps: PlayerStats,
	tier: "0" | "20" | "30" | "40" | "50",
) =>
	FP[`fg${tier}`] * ps[`fg${tier}`] -
	FP.fgMiss * (ps[`fga${tier}`] - ps[`fg${tier}`]);

export const pprReceptionPoints = (ps: PlayerStats) => FP.pprRec * ps.rec;

export const halfPprReceptionPoints = (ps: PlayerStats) =>
	FP.halfPprRec * ps.rec;
