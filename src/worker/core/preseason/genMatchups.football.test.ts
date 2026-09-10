import { assert, test } from "vitest";
import genMatchups, {
	NUM_PRESEASON_WEEKS,
	REMATCH_WEEK,
} from "./genMatchups.football.ts";

const TIDS = Array.from({ length: 32 }, (_, i) => i);

const pairKey = (m: { homeTid: number; awayTid: number }) =>
	m.homeTid < m.awayTid
		? `${m.homeTid},${m.awayTid}`
		: `${m.awayTid},${m.homeTid}`;

const byWeek = (matchups: { week: number }[], week: number) =>
	matchups.filter((m) => m.week === week);

test("every team plays once a week, for three weeks", () => {
	const output = genMatchups({ tids: TIDS });

	for (let week = 1; week <= NUM_PRESEASON_WEEKS; week++) {
		const games = byWeek(output, week);
		assert.strictEqual(games.length, TIDS.length / 2, `week ${week}`);

		const playing = games.flatMap((m: any) => [m.homeTid, m.awayTid]);
		assert.deepStrictEqual(
			[...playing].sort((a, b) => a - b),
			[...TIDS].sort((a, b) => a - b),
			`week ${week} did not use every team exactly once`,
		);
	}
});

test("no team ever faces the same opponent twice", () => {
	// Probabilistic: the greedy pairing can corner itself, so this is really a
	// test that the retry logic recovers every time.
	for (let i = 0; i < 200; i++) {
		const output = genMatchups({ tids: TIDS });
		const keys = output.map(pairKey);
		assert.strictEqual(
			new Set(keys).size,
			keys.length,
			`repeated matchup on iteration ${i}`,
		);
	}
});

test("week 3 contains the Super Bowl rematch", () => {
	for (let i = 0; i < 50; i++) {
		const output = genMatchups({ tids: TIDS, champTid: 7, runnerUpTid: 12 });
		const found = byWeek(output, REMATCH_WEEK).some(
			(m: any) => pairKey(m) === "7,12",
		);
		assert.ok(found, `rematch missing on iteration ${i}`);
	}
});

test("the rematch is one game among a full week 3 slate", () => {
	const output = genMatchups({ tids: TIDS, champTid: 7, runnerUpTid: 12 });
	assert.strictEqual(byWeek(output, REMATCH_WEEK).length, TIDS.length / 2);
});

test("week 3 is drawn normally when the final can't be resolved", () => {
	const cases: { champTid?: number; runnerUpTid?: number }[] = [
		{}, // no previous season
		{ champTid: 7 }, // runner-up missing
		{ runnerUpTid: 12 }, // champ missing
		{ champTid: 7, runnerUpTid: 7 }, // same team twice
		{ champTid: 7, runnerUpTid: 99 }, // team no longer exists
		{ champTid: 99, runnerUpTid: 100 }, // neither exists
	];

	for (const c of cases) {
		const output = genMatchups({ tids: TIDS, ...c });
		assert.strictEqual(
			byWeek(output, REMATCH_WEEK).length,
			TIDS.length / 2,
			JSON.stringify(c),
		);
		for (const m of output) {
			assert.ok(TIDS.includes(m.homeTid), JSON.stringify(c));
			assert.ok(TIDS.includes(m.awayTid), JSON.stringify(c));
		}
	}
});

test("never pairs a team against itself", () => {
	for (let i = 0; i < 200; i++) {
		for (const m of genMatchups({ tids: TIDS })) {
			assert.notStrictEqual(m.homeTid, m.awayTid);
		}
	}
});

test("an odd team count gives exactly one bye per week", () => {
	const odd = Array.from({ length: 9 }, (_, i) => i);
	const output = genMatchups({ tids: odd });

	for (let week = 1; week <= NUM_PRESEASON_WEEKS; week++) {
		const games = byWeek(output, week);
		assert.strictEqual(games.length, 4, `week ${week}`);

		const playing = new Set(games.flatMap((m: any) => [m.homeTid, m.awayTid]));
		assert.strictEqual(
			playing.size,
			8,
			`week ${week} should leave exactly one team out`,
		);
	}
});

test("games within a week are indexed from zero", () => {
	const output = genMatchups({ tids: TIDS });

	for (let week = 1; week <= NUM_PRESEASON_WEEKS; week++) {
		const idxs = byWeek(output, week).map((m: any) => m.idx);
		assert.deepStrictEqual(
			[...idxs].sort((a, b) => a - b),
			idxs.map((_, i) => i),
			`week ${week}`,
		);
	}
});

test("home and away both get used over many runs", () => {
	const homes = new Set<number>();
	for (let i = 0; i < 200; i++) {
		for (const m of genMatchups({
			tids: TIDS,
			champTid: 7,
			runnerUpTid: 12,
		})) {
			if (pairKey(m) === "7,12") {
				homes.add(m.homeTid);
			}
		}
	}
	assert.deepStrictEqual(
		[...homes].sort((a, b) => a - b),
		[7, 12],
	);
});

test("degenerate team counts don't throw", () => {
	assert.deepStrictEqual(genMatchups({ tids: [] }), []);
	assert.deepStrictEqual(genMatchups({ tids: [0] }), []);

	// Only one pairing exists, so weeks 2 and 3 are skipped rather than repeat
	// it. Week 3 is generated first, so that is the one that survives.
	const two = genMatchups({ tids: [0, 1] });
	assert.strictEqual(two.length, 1);
	assert.strictEqual(two[0]!.week, REMATCH_WEEK);
});
