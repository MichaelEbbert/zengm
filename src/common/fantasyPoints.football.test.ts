import { assert, test } from "vitest";
import { FANTASY_POINTS } from "./fantasyPoints.football.ts";
import processPlayerStats from "./processPlayerStats.football.ts";

const ps = {
	pssYds: 312,
	pssCmp: 24,
	pssTD: 3,
	rusYds: 41,
	recYds: 57,
	rusTD: 1,
	recTD: 1,
	prTD: 1,
	krTD: 0,
	pssInt: 2,
	fmbLost: 1,
	xp: 4,
	fg0: 1,
	fg20: 1,
	fg30: 0,
	fg40: 2,
	fg50: 1,
	fga0: 1,
	fga20: 2,
	fga30: 1,
	fga40: 2,
	fga50: 3,
	rec: 5,
};

// The upstream formula, before the weights moved to fantasyPoints.football.ts
const upstream = (ppr: number) =>
	ps.pssYds / 25 +
	4 * ps.pssTD +
	(ps.rusYds + ps.recYds) / 10 +
	6 * (ps.rusTD + ps.recTD + ps.prTD + ps.krTD) -
	2 * (ps.pssInt + ps.fmbLost) +
	ps.xp +
	3 * ps.fg0 +
	3 * ps.fg20 +
	3 * ps.fg30 +
	4 * ps.fg40 +
	5 * ps.fg50 +
	ppr * ps.rec;

// Upstream's weights, so the test holds whatever FANTASY_POINTS is set to
const UPSTREAM_WEIGHTS = {
	passYdsPerPoint: 25,
	rushRecYdsPerPoint: 10,
	passCmp: 0,
	passTD: 4,
	nonPassTD: 6,
	returnTD: 6,
	turnover: 2,
	xp: 1,
	fg0: 3,
	fg20: 3,
	fg30: 3,
	fg40: 4,
	fg50: 5,
	fgMiss: 0,
	pprRec: 1,
	halfPprRec: 0.5,
};

test("upstream weights reproduce the upstream fp formula", () => {
	const saved = { ...FANTASY_POINTS };
	Object.assign(FANTASY_POINTS, UPSTREAM_WEIGHTS);
	try {
		for (const [setting, ppr] of [
			["standard", 0],
			["ppr", 1],
			["halfPpr", 0.5],
		] as const) {
			const row = processPlayerStats(ps, ["fp"], undefined, () => setting);
			assert.closeTo(row.fp, upstream(ppr), 1e-9, setting);
		}
	} finally {
		Object.assign(FANTASY_POINTS, saved);
	}
});
