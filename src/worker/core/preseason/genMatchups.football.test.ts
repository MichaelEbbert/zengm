import { assert, test } from "vitest";
import genMatchups, { REMATCH_WEEK } from "./genMatchups.football.ts";

const TIDS = Array.from({ length: 32 }, (_, i) => i);

const pairKey = (m: { homeTid: number; awayTid: number }) =>
	m.homeTid < m.awayTid
		? `${m.homeTid},${m.awayTid}`
		: `${m.awayTid},${m.homeTid}`;

test("returns three matchups, weeks 1 through 3", () => {
	const output = genMatchups({ tids: TIDS });
	assert.deepStrictEqual(
		output.map((m) => m.week),
		[1, 2, 3],
	);
});

test("week 3 replays the final", () => {
	const output = genMatchups({ tids: TIDS, champTid: 7, runnerUpTid: 12 });
	const week3 = output.find((m) => m.week === REMATCH_WEEK)!;
	assert.deepStrictEqual(
		[week3.homeTid, week3.awayTid].sort((x, y) => x - y),
		[7, 12],
	);
});

test("week 3 falls back to a random pair when the final can't be resolved", () => {
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
		assert.strictEqual(output.length, 3, JSON.stringify(c));

		const week3 = output.find((m) => m.week === REMATCH_WEEK)!;
		assert.notStrictEqual(week3.homeTid, week3.awayTid);
		assert.ok(TIDS.includes(week3.homeTid), JSON.stringify(c));
		assert.ok(TIDS.includes(week3.awayTid), JSON.stringify(c));
	}
});

test("no pair is ever repeated across the three weeks", () => {
	// Small pool so collisions are likely -- 5 teams gives only 10 distinct
	// pairs, so a naive draw would repeat often. Many iterations because this is
	// a probabilistic failure that a single run would almost never surface.
	for (let i = 0; i < 500; i++) {
		const output = genMatchups({
			tids: [0, 1, 2, 3, 4],
			champTid: 0,
			runnerUpTid: 1,
		});
		const keys = output.map(pairKey);
		assert.strictEqual(
			new Set(keys).size,
			keys.length,
			`repeated pair on iteration ${i}: ${keys.join(" / ")}`,
		);
	}
});

test("never pairs a team against itself", () => {
	for (let i = 0; i < 500; i++) {
		for (const m of genMatchups({ tids: TIDS })) {
			assert.notStrictEqual(m.homeTid, m.awayTid);
		}
	}
});

test("a team may appear in more than one matchup", () => {
	// Allowed by design. With only 3 teams every draw must reuse someone, so
	// this also proves we don't deadlock trying to avoid it.
	const output = genMatchups({ tids: [0, 1, 2] });
	assert.strictEqual(output.length, 3);

	const appearances = output.flatMap((m) => [m.homeTid, m.awayTid]);
	assert.strictEqual(appearances.length, 6);
	assert.ok(new Set(appearances).size < appearances.length);
});

test("home and away both get used over many runs", () => {
	// Guards against a hardcoded home side.
	const homes = new Set<number>();
	for (let i = 0; i < 200; i++) {
		const week3 = genMatchups({
			tids: TIDS,
			champTid: 7,
			runnerUpTid: 12,
		}).find((m) => m.week === REMATCH_WEEK)!;
		homes.add(week3.homeTid);
	}
	assert.deepStrictEqual(
		[...homes].sort((x, y) => x - y),
		[7, 12],
	);
});

test("degenerate team counts don't throw", () => {
	assert.deepStrictEqual(genMatchups({ tids: [] }), []);
	assert.deepStrictEqual(genMatchups({ tids: [0] }), []);
	assert.strictEqual(genMatchups({ tids: [0, 1] }).length, 3);
});
