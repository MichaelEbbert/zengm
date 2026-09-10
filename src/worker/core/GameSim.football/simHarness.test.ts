import { assert, describe, expect, test } from "vitest";
import { writeFileSync } from "node:fs";
import { idb } from "../../db/index.ts";
import {
	ROSTER_TEMPLATE,
	clockReport,
	formatClockReport,
	formatStateResults,
	formatSummaries,
	genHarnessTeams,
	setPosition,
	simFromState,
	simGames,
	summarize,
	type GameRecord,
	type SnapKind,
	type StateResult,
} from "./simHarness.ts";

const posCounts = async (tid: number) => {
	const players = await idb.cache.players.indexGetAll("playersByTid", tid);
	const counts: Record<string, number> = {};
	for (const p of players) {
		const pos = p.ratings.at(-1)!.pos;
		counts[pos] = (counts[pos] ?? 0) + 1;
	}
	return counts;
};

describe("sim harness", () => {
	test("generated teams fill every position quota", async () => {
		await genHarnessTeams();
		for (const tid of [0, 1]) {
			assert.deepStrictEqual(
				await posCounts(tid),
				ROSTER_TEMPLATE,
				`tid ${tid}`,
			);
		}
	});

	test("generated players have real ovrs, and depth is sorted by them", async () => {
		await genHarnessTeams();
		const players = await idb.cache.players.indexGetAll("playersByTid", 0);
		for (const p of players) {
			const r = p.ratings.at(-1)!;
			assert.ok(r.ovr > 0, `pid ${p.pid} (${r.pos}) has ovr ${r.ovr}`);
			assert.strictEqual(r.ovr, r.ovrs[r.pos], `pid ${p.pid} ovr vs ovrs`);
		}

		const t = await idb.cache.teams.get(0);
		const qbOvrs = (t!.depth as Record<string, number[]>)
			.QB!.slice(0, ROSTER_TEMPLATE.QB!)
			.map(
				(pid) => players.find((p) => p.pid === pid)!.ratings.at(-1)!.ovrs.QB,
			);
		assert.deepStrictEqual(
			qbOvrs,
			[...qbOvrs].sort((a, b) => b - a),
			"QB depth is sorted by QB ovr",
		);
	});

	test("setPosition pins exact ovrs in depth order", async () => {
		await genHarnessTeams();
		const targets = [80, 70, 60, 50, 40, 40, 40];
		const pids = await setPosition(0, "OL", targets);

		const t = await idb.cache.teams.get(0);
		assert.deepStrictEqual(
			(t!.depth as Record<string, number[]>).OL!.slice(0, targets.length),
			pids,
		);

		assert.strictEqual(
			(await posCounts(0)).OL,
			targets.length,
			"the position group is exactly the spec",
		);

		for (const [i, pid] of pids.entries()) {
			const p = await idb.cache.players.get(pid);
			const ovr = p!.ratings.at(-1)!.ovrs.OL;
			assert.ok(
				Math.abs(ovr - targets[i]!) <= 1,
				`slot ${i}: wanted ${targets[i]}, got ${ovr}`,
			);
		}
	});

	test("setPosition applies raw rating overrides", async () => {
		await genHarnessTeams();
		const [pid] = await setPosition(1, "P", [
			{ ratings: { ppw: 99, pac: 39 } },
		]);

		const r = (await idb.cache.players.get(pid!))!.ratings.at(
			-1,
		)! as unknown as Record<string, number>;
		assert.strictEqual(r.ppw, 99);
		assert.strictEqual(r.pac, 39);

		const t = await idb.cache.teams.get(1);
		assert.strictEqual((t!.depth as Record<string, number[]>).P![0], pid);
	});

	test("simGames plays complete games and records every snap", async () => {
		await genHarnessTeams();
		const records = await simGames({ n: 2, coach: false });
		assert.strictEqual(records.length, 2);

		for (const r of records) {
			assert.ok(r.snaps.length > 100, `only ${r.snaps.length} snaps`);
			for (const s of r.snaps) {
				assert.ok(s.gap === undefined || s.gap >= 0, `negative gap ${s.gap}`);
			}
		}

		const summary = summarize(records);
		assert.ok(
			summary.offensivePlaysPerTeamGame > 40 &&
				summary.offensivePlaysPerTeamGame < 90,
			`${summary.offensivePlaysPerTeamGame} offensive plays per team-game`,
		);
	}, 60_000);

	test("simGames with the coach calling plays completes a game", async () => {
		await genHarnessTeams();
		const [record] = await simGames({ n: 1, coach: true });
		assert.ok(record!.snaps.length > 100, `only ${record!.snaps.length} snaps`);
	}, 60_000);
});

// Experiment runner, skipped unless SIM_HARNESS is set:
//   SIM_HARNESS=1 SIM_GAMES=200 npx vitest run --project football src/worker/core/GameSim.football/simHarness.test.ts
// SIM_OUT=<path> also writes the summaries as JSON. Edit this test to set up a
// scenario -- setPosition() for exact ratings, coach on or off per batch.
test.skipIf(!process.env.SIM_HARNESS)(
	"experiment: coach vs stock play-calling",
	async () => {
		const n = Number(process.env.SIM_GAMES ?? 100);

		await genHarnessTeams();
		const results = {
			coach: summarize(await simGames({ n, coach: true })),
			stock: summarize(await simGames({ n, coach: false })),
		};

		// stdout directly -- vitest's console capture drops console.log here
		process.stdout.write(`\n${formatSummaries(results)}\n\n`);
		if (process.env.SIM_OUT) {
			writeFileSync(process.env.SIM_OUT, JSON.stringify(results, null, 2));
		}
	},
	60 * 60 * 1000,
);

describe("simFromState", () => {
	test("the engine sees the given state on the first snap", async () => {
		await genHarnessTeams();
		const state = {
			down: 4,
			toGo: 2,
			scrimmage: 80,
			clock: 0.15,
			quarter: 4,
			diff: -2,
			timeouts: [1, 2] as [number, number],
		};
		const result = await simFromState({ n: 1, coach: false, state });
		assert.deepStrictEqual(result.firstSnap, state);
	});

	test("down 2 at the opp 20 with no time left -> stock logic kicks the late field goal", async () => {
		// Same situation as the "kick a field goal when down 2 at the end of the
		// game" test in index.test.ts
		await genHarnessTeams();
		const result = await simFromState({
			n: 20,
			coach: false,
			state: {
				down: 1,
				toGo: 10,
				scrimmage: 80,
				clock: 0.01,
				quarter: 4,
				diff: -2,
			},
		});
		assert.deepStrictEqual(result.calls, { fieldGoalLate: 20 });
	});

	// One snap can swing at most 8 points (TD + 2), so a 10-point margin decides it
	test("leading by 10 with one snap left never loses", async () => {
		await genHarnessTeams();
		const result = await simFromState({
			n: 50,
			coach: false,
			state: {
				down: 1,
				toGo: 10,
				scrimmage: 20,
				clock: 0.01,
				quarter: 4,
				diff: 10,
			},
		});
		assert.strictEqual(result.win, 1);
		assert.strictEqual(result.loss, 0);
	});

	test("trailing by 10 with one snap left never wins", async () => {
		await genHarnessTeams();
		const result = await simFromState({
			n: 50,
			coach: false,
			state: {
				down: 1,
				toGo: 10,
				scrimmage: 20,
				clock: 0.01,
				quarter: 4,
				diff: -10,
			},
		});
		assert.strictEqual(result.win, 0);
		assert.strictEqual(result.tie, 0);
		assert.strictEqual(result.loss, 1);
		assert.ok(
			result.ptsFor >= 0 && result.ptsFor <= 8,
			`ptsFor ${result.ptsFor}`,
		);
	});

	test("rejects a state the engine can't represent", async () => {
		await genHarnessTeams();
		await expect(
			simFromState({
				n: 1,
				coach: false,
				state: {
					down: 5,
					toGo: 10,
					scrimmage: 50,
					clock: 5,
					quarter: 4,
					diff: 0,
				},
			}),
		).rejects.toThrow(/down/);
	});

	test("coach play-calling runs from a set state", async () => {
		await genHarnessTeams();
		const result = await simFromState({
			n: 20,
			coach: true,
			state: {
				down: 4,
				toGo: 2,
				scrimmage: 80,
				clock: 0.15,
				quarter: 4,
				diff: -3,
			},
		});
		const total = Object.values(result.calls).reduce((a, b) => a + b, 0);
		assert.strictEqual(total, 20);
		assert.ok(Math.abs(result.win + result.tie + result.loss - 1) < 1e-9);
	}, 60_000);
});

// Experiment runner, skipped unless SIM_HARNESS is set:
//   SIM_HARNESS=1 SIM_GAMES=500 npx vitest run --project football src/worker/core/GameSim.football/simHarness.test.ts -t "4th and 2"
test.skipIf(!process.env.SIM_HARNESS)(
	"experiment: 4th and 2 from the opp 20, 0:09 left",
	async () => {
		const n = Number(process.env.SIM_GAMES ?? 500);

		await genHarnessTeams();
		// A league-average starting kicker on both sides (Goin Fast 1921: kpw 63,
		// kac 59), so the result isn't one random kicker's accuracy
		for (const tid of [0, 1]) {
			await setPosition(tid, "K", [{ ratings: { kpw: 63, kac: 59 } }]);
		}
		const results: Record<string, StateResult> = {};
		for (const coach of [true, false]) {
			for (const diff of [-7, -3, -2, -1, 0, 1, 3]) {
				const label = `${coach ? "coach" : "stock"} ${diff > 0 ? "+" : ""}${diff}`;
				results[label] = await simFromState({
					n,
					coach,
					state: {
						down: 4,
						toGo: 2,
						scrimmage: 80,
						clock: 0.15,
						quarter: 4,
						diff,
					},
				});
			}
		}

		process.stdout.write(`\n${formatStateResults(results)}\n\n`);
		if (process.env.SIM_OUT) {
			writeFileSync(process.env.SIM_OUT, JSON.stringify(results, null, 2));
		}
	},
	60 * 60 * 1000,
);

describe("head-to-head", () => {
	test("simGames alternates sides so each roster gets the coach half the time", async () => {
		await genHarnessTeams();
		const records = await simGames({ n: 2, coach: [true, false] });
		assert.deepStrictEqual(
			records.map((r) => r.coachPlayCalling),
			[
				[true, false],
				[false, true],
			],
		);
	}, 60_000);

	test("a single coach setting applies to both teams", async () => {
		await genHarnessTeams();
		const [record] = await simGames({ n: 1, coach: false });
		assert.deepStrictEqual(record!.coachPlayCalling, [false, false]);
	}, 60_000);

	test("summarize splits results by each side's play-calling", () => {
		const snap = (offense: number, kind: SnapKind) => ({
			quarter: 1,
			clock: 10,
			offense,
			kind,
			returned: false,
			hurryUp: false,
		});
		const records: GameRecord[] = [
			{
				pts: [24, 10],
				overtimes: 0,
				coachPlayCalling: [true, false],
				snaps: [snap(0, "completion"), snap(0, "interception"), snap(1, "run")],
			},
			{
				pts: [7, 7],
				overtimes: 0,
				coachPlayCalling: [false, true],
				snaps: [snap(1, "completion"), snap(0, "run"), snap(0, "incompletion")],
			},
		];

		const { bySetting } = summarize(records);

		// Coach: team 0 in game 1 (won 24-10), team 1 in game 2 (tied 7-7)
		assert.deepStrictEqual(bySetting.coach, {
			teamGames: 2,
			ptsFor: 15.5,
			ptsAgainst: 8.5,
			win: 0.5,
			tie: 0.5,
			loss: 0,
			offensivePlaysPerTeamGame: 1.5,
			passRate: 1,
			intRate: 1 / 3,
		});
		// Stock: team 1 in game 1 (lost 10-24), team 0 in game 2 (tied 7-7)
		assert.deepStrictEqual(bySetting.stock, {
			teamGames: 2,
			ptsFor: 8.5,
			ptsAgainst: 15.5,
			win: 0,
			tie: 0.5,
			loss: 0.5,
			offensivePlaysPerTeamGame: 1.5,
			passRate: 1 / 3,
			intRate: 0,
		});
	});

	test("simFromState: the offense's own setting picks the first call", async () => {
		// Down 7, 4th and 2: the coach always runs here, stock almost always passes
		await genHarnessTeams();
		const state = {
			down: 4,
			toGo: 2,
			scrimmage: 80,
			clock: 0.15,
			quarter: 4,
			diff: -7,
		};

		const coachOffense = await simFromState({
			n: 20,
			coach: [true, false],
			state,
		});
		assert.deepStrictEqual(coachOffense.calls, { run: 20 });

		const stockOffense = await simFromState({
			n: 20,
			coach: [false, true],
			state,
		});
		assert.ok(
			(stockOffense.calls.run ?? 0) < 20,
			JSON.stringify(stockOffense.calls),
		);
	}, 60_000);
});

// Experiment runner, skipped unless SIM_HARNESS is set:
//   SIM_HARNESS=1 SIM_GAMES=400 npx vitest run --project football src/worker/core/GameSim.football/simHarness.test.ts -t "head-to-head,"
test.skipIf(!process.env.SIM_HARNESS)(
	"experiment: head-to-head, coach vs stock",
	async () => {
		const n = Number(process.env.SIM_GAMES ?? 400);

		await genHarnessTeams();
		const summary = summarize(await simGames({ n, coach: [true, false] }));

		process.stdout.write(
			`\n${formatSummaries({ "head-to-head": summary })}\n\n`,
		);
		if (process.env.SIM_OUT) {
			writeFileSync(process.env.SIM_OUT, JSON.stringify(summary, null, 2));
		}
	},
	60 * 60 * 1000,
);

describe("clock", () => {
	test("hurry-up timing only happens in the last two minutes of a half", async () => {
		await genHarnessTeams();
		const records = await simGames({ n: 20, coach: false });
		const hurried = records.flatMap((r) => r.snaps).filter((s) => s.hurryUp);

		assert.ok(hurried.length > 0, "no hurry-up snaps in 20 games");
		for (const s of hurried) {
			assert.ok(s.clock <= 2, `hurry-up at ${s.clock} min`);
			assert.ok(
				s.quarter === 2 || s.quarter >= 4,
				`hurry-up in quarter ${s.quarter}`,
			);
		}
	}, 60_000);

	test("clockReport bins non-hurry-up gaps in 5-second steps, by whole seconds", () => {
		const snap = (
			offense: number,
			gap: number | undefined,
			hurryUp = false,
		) => ({
			quarter: 1,
			clock: 10,
			offense,
			kind: "run" as SnapKind,
			returned: false,
			hurryUp,
			gap,
		});
		const records: GameRecord[] = [
			{
				pts: [0, 0],
				overtimes: 0,
				coachPlayCalling: [true, true],
				snaps: [
					snap(0, 0),
					snap(0, 5.4), // rounds to 5 -> 0-5s
					snap(0, 5.6), // rounds to 6 -> 6-10s
					snap(0, 12),
					snap(0, 44),
					snap(0, 8, true), // hurry-up: excluded from the bins
					snap(1, undefined), // last snap of a period: no gap
				],
			},
		];

		const report = clockReport(records);
		assert.strictEqual(report.gaps, 5);
		assert.strictEqual(report.hurryUpGaps, 1);
		assert.deepStrictEqual(
			report.buckets.map((b) => [b.label, b.count]),
			[
				["0-5s", 2],
				["6-10s", 1],
				["11-15s", 1],
				["16-20s", 0],
				["21-25s", 0],
				["26-30s", 0],
				["31-35s", 0],
				["36-40s", 0],
				["41-45s", 1],
			],
		);

		// Team 0 ran 6 offensive plays, team 1 ran 1
		assert.strictEqual(report.offensivePlays.mean, 3.5);
		assert.strictEqual(report.offensivePlays.min, 1);
		assert.strictEqual(report.offensivePlays.max, 6);
	});
});

// Experiment runner, skipped unless SIM_HARNESS is set:
//   SIM_HARNESS=1 SIM_GAMES=500 npx vitest run --project football src/worker/core/GameSim.football/simHarness.test.ts -t "clock distribution"
test.skipIf(!process.env.SIM_HARNESS)(
	"experiment: clock distribution, coach play-calling",
	async () => {
		const n = Number(process.env.SIM_GAMES ?? 500);

		await genHarnessTeams();
		const report = clockReport(await simGames({ n, coach: true }));

		process.stdout.write(`\n${formatClockReport(report)}\n\n`);
		if (process.env.SIM_OUT) {
			writeFileSync(process.env.SIM_OUT, JSON.stringify(report, null, 2));
		}
	},
	60 * 60 * 1000,
);
