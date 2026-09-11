import { assert, describe, expect, test } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { idb } from "../../db/index.ts";
import { team } from "../index.ts";
import {
	BIG_PLAY_YARDS,
	DEAD_TIME,
	HURRY_UP_OUT_OF_BOUNDS_RATE,
	HURRY_UP_PLAY_LENGTH,
	LATE_WINDOW_MINUTES,
	LATE_WINDOW_RULES,
	OUT_OF_BOUNDS_RATE,
	PLAY_LENGTH,
} from "./playClock.ts";
import {
	ROSTER_TEMPLATE,
	STOP_CAUSES,
	clockReport,
	formatClockReport,
	formatGameReport,
	formatOffenseReport,
	formatStateResults,
	formatSummaries,
	gameReport,
	genHarnessTeams,
	offenseReport,
	setPosition,
	simFromState,
	simGames,
	summarize,
	teamOvr,
	type GameRecord,
	type HarnessRoster,
	type SnapKind,
	type StateResult,
} from "./simHarness.ts";

// Two real teams exported from the Goin Fast league: LAC (team ovr 63) and BUF
// (team ovr 44)
const goinFast1921 = (): Record<"LAC" | "BUF", HarnessRoster> =>
	JSON.parse(
		readFileSync(
			new URL("./harnessRosters/goinFast1921.json", import.meta.url),
			"utf8",
		),
	);

// Every depth chart lists the whole roster, and the positions nobody else can
// play are topped by a player from that position. An empty depth chart makes
// the game sim fall back to roster order -- a cornerback at QB. (Other
// positions can legitimately start someone listed elsewhere: auto-sort uses
// fuzzed ratings and a WR who's a better TE starts at TE.)
const assertStartersPlayTheirPosition = async (tid: number) => {
	const t = (await idb.cache.teams.get(tid))!;
	const players = await idb.cache.players.indexGetAll("playersByTid", tid);
	for (const [pos, pids] of Object.entries(
		t.depth as Record<string, number[]>,
	)) {
		assert.strictEqual(pids.length, players.length, `tid ${tid} ${pos} depth`);
	}

	const depth = team.getDepthPlayers(t.depth!, players);
	for (const pos of ["QB", "K", "P"]) {
		const starter = depth[pos]![0]!;
		assert.strictEqual(
			starter.ratings.at(-1)!.pos,
			pos,
			`tid ${tid} ${pos}1 is pid ${starter.pid}`,
		);
	}
};

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

	test("generated players have real ovrs, and depth charts are built", async () => {
		await genHarnessTeams();
		const players = await idb.cache.players.indexGetAll("playersByTid", 0);
		for (const p of players) {
			const r = p.ratings.at(-1)!;
			assert.ok(r.ovr > 0, `pid ${p.pid} (${r.pos}) has ovr ${r.ovr}`);
			assert.strictEqual(r.ovr, r.ovrs[r.pos], `pid ${p.pid} ovr vs ovrs`);
		}

		for (const tid of [0, 1]) {
			await assertStartersPlayTheirPosition(tid);
		}
	});

	test("genHarnessTeams with a seed builds the same rosters every time", async () => {
		const snapshot = async () => {
			const players = [
				...(await idb.cache.players.indexGetAll("playersByTid", 0)),
				...(await idb.cache.players.indexGetAll("playersByTid", 1)),
			];
			return players
				.sort((a, b) => a.pid - b.pid)
				.map((p) => ({
					tid: p.tid,
					name: `${p.firstName} ${p.lastName}`,
					ratings: p.ratings.at(-1),
				}));
		};

		const random = Math.random;
		await genHarnessTeams({ seed: 7 });
		const first = await snapshot();
		assert.strictEqual(Math.random, random, "Math.random is restored");

		await genHarnessTeams({ seed: 7 });
		assert.deepStrictEqual(await snapshot(), first);

		await genHarnessTeams({ seed: 8 });
		assert.notDeepEqual(await snapshot(), first);
	});

	test("genHarnessTeams loads real rosters with their ratings and team ovr", async () => {
		const { LAC, BUF } = goinFast1921();
		await genHarnessTeams({ rosters: [LAC, BUF] });

		for (const [tid, roster] of [
			[0, LAC],
			[1, BUF],
		] as const) {
			const players = await idb.cache.players.indexGetAll("playersByTid", tid);
			const loaded = players
				.map((p) => {
					const r = p.ratings.at(-1)!;
					return `${p.firstName} ${p.lastName} ${r.pos} ${r.ovr}`;
				})
				.sort();
			const expected = roster.players
				.map((p) => `${p.firstName} ${p.lastName} ${p.pos} ${p.ovr}`)
				.sort();
			assert.deepStrictEqual(loaded, expected, roster.abbrev);
			assert.strictEqual(await teamOvr(tid), roster.teamOvr, roster.abbrev);
			await assertStartersPlayTheirPosition(tid);
		}
	});

	test("real rosters get the same depth chart on every load", async () => {
		// Depth charts sort on fuzzed ratings; a fresh fuzz roll per load would
		// change the starters -- even the QB -- between before/after runs
		const { LAC, BUF } = goinFast1921();
		const depths = async () => {
			await genHarnessTeams({ rosters: [LAC, BUF] });
			return [
				(await idb.cache.teams.get(0))!.depth,
				(await idb.cache.teams.get(1))!.depth,
			];
		};
		const first = await depths();
		for (let i = 0; i < 3; i++) {
			assert.deepStrictEqual(await depths(), first, `load ${i + 2}`);
		}
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

	test("reports how the opening drive ended", async () => {
		// Down 2 with one snap left: the late field goal wins exactly when it's good
		await genHarnessTeams();
		const result = await simFromState({
			n: 40,
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
		const { td, fg, none } = result.openingDrive;
		assert.strictEqual(td, 0);
		assert.strictEqual(fg, result.win);
		assert.ok(Math.abs(fg + none - 1) < 1e-9, `fg ${fg} + none ${none}`);
	}, 60_000);

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
			ptsScored: [0, 0] as [number, number],
			newDrive: false,
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
			ptsScored: [0, 0] as [number, number],
			newDrive: false,
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

	test("every snap records the points it scored", async () => {
		await genHarnessTeams();
		const records = await simGames({ n: 3, coach: false });
		for (const r of records) {
			const scored = [0, 0];
			for (const s of r.snaps) {
				scored[0]! += s.ptsScored[0];
				scored[1]! += s.ptsScored[1];
			}
			assert.deepStrictEqual(scored, r.pts);
		}
	}, 60_000);

	test("the first snap of each drive is marked", async () => {
		await genHarnessTeams();
		const records = await simGames({ n: 3, coach: false });
		for (const r of records) {
			const drives = r.snaps.filter((s) => s.newDrive);
			assert.ok(
				drives.length >= 10 && drives.length <= 40,
				`${drives.length} drives`,
			);
			for (const s of drives) {
				assert.ok(
					!["kickoff", "extraPoint", "twoPoint"].includes(s.kind),
					`a drive starts with a ${s.kind}`,
				);
			}
		}
	}, 60_000);

	test("each snap's dead time follows its case, and the gap is play plus dead time", async () => {
		const { LAC, BUF } = goinFast1921();
		await genHarnessTeams({ rosters: [LAC, BUF] });
		const records = await simGames({ n: 20, coach: true });
		const snaps = records.flatMap((r) => r.snaps);

		// The hurry-up floor is 0 because of the "leave time for a field goal" rule
		const range = (c: string): [number, number] => {
			if (c === "none") return [0, 0];
			if (c === "timeout") return [0, 2];
			if (c === "hurryUp") return [0, 13];
			const spec = DEAD_TIME[c as keyof typeof DEAD_TIME] as {
				min: number;
				max: number;
			};
			return [spec.min, spec.max];
		};

		const seen = new Set<string>();
		for (const s of snaps) {
			assert.ok(
				s.deadTimeCase !== undefined && s.deadTime !== undefined,
				`${s.kind}: no dead time recorded`,
			);
			seen.add(s.deadTimeCase);

			const [lo, hi] = range(s.deadTimeCase);
			assert.ok(
				s.deadTime <= hi + 1e-9,
				`${s.deadTimeCase} after a ${s.kind}: ${s.deadTime}s`,
			);
			// The two-minute warning and the end of a period can cut it short
			if (s.gap !== undefined && s.stop !== "twoMinuteWarning") {
				assert.ok(
					s.deadTime >= lo - 1e-9,
					`${s.deadTimeCase} after a ${s.kind}: ${s.deadTime}s`,
				);
			}

			// The gap to the next snap is the play plus the dead time, unless the
			// period's clock ran out first
			if (s.gap !== undefined) {
				const charged = s.playTime! + s.deadTime;
				if (s.clock * 60 - s.gap > 0.01) {
					assert.ok(
						Math.abs(s.gap - charged) < 0.01,
						`gap ${s.gap}s vs ${s.playTime}s play + ${s.deadTime}s dead`,
					);
				} else {
					assert.ok(s.gap <= charged + 0.01, `gap ${s.gap}s > ${charged}s`);
				}
			}

			// Out of bounds and changes of possession stop the clock outright in
			// the last 2:00 of the first half and the last 5:00 of the game
			if (
				s.deadTimeCase === "outOfBounds" ||
				s.deadTimeCase === "possessionChange"
			) {
				const clockAfterPlay = s.clock - s.playTime! / 60;
				const late =
					(s.quarter === 2 && clockAfterPlay <= 2) ||
					(s.quarter >= 4 && clockAfterPlay <= 5);
				assert.ok(
					!late,
					`${s.deadTimeCase} dead time at ${clockAfterPlay.toFixed(2)} in Q${s.quarter}`,
				);
			}
		}

		for (const c of [
			"inBounds",
			"outOfBounds",
			"possessionChange",
			"penalty",
			"none",
		]) {
			assert.ok(seen.has(c), `no ${c} snaps in 20 games`);
		}
	}, 60_000);

	test("each snap's play time follows the play-length plan", async () => {
		const { LAC, BUF } = goinFast1921();
		await genHarnessTeams({ rosters: [LAC, BUF] });
		const records = await simGames({ n: 20, coach: true });
		const snaps = records.flatMap((r) => r.snaps);

		const scrimmage = snaps.filter((s) =>
			["run", "completion", "incompletion", "interception", "sack"].includes(
				s.kind,
			),
		);
		assert.ok(scrimmage.length > 1000, `${scrimmage.length} scrimmage plays`);
		// Hurry-up snaps have their own, shorter play length (floor 3s)
		for (const s of scrimmage) {
			const floor = s.hurriedSnap ? 3 : 4;
			assert.ok(
				s.playTime !== undefined && s.playTime >= floor && s.playTime <= 12,
				`${s.kind} took ${s.playTime}s`,
			);
		}

		// A few big plays a game, and a mean near 6s
		const times = scrimmage.map((s) => s.playTime!);
		const big = times.filter((t) => t >= 10).length / times.length;
		assert.ok(
			big >= 0.01 && big <= 0.06,
			`${(100 * big).toFixed(1)}% big plays`,
		);
		const avg = times.reduce((a, b) => a + b, 0) / times.length;
		assert.ok(avg >= 5.7 && avg <= 6.5, `mean play ${avg.toFixed(2)}s`);

		for (const s of snaps) {
			if (s.kind === "extraPoint" || s.kind === "twoPoint") {
				assert.strictEqual(s.playTime, 0, `${s.kind} took ${s.playTime}s`);
			}
			if (s.kind !== "kneel") {
				assert.ok(
					s.playTime !== undefined && s.playTime <= 12,
					`${s.kind} took ${s.playTime}s`,
				);
			}
		}
	}, 60_000);

	test("no timeout is called after a play that already stopped the clock", async () => {
		const { LAC, BUF } = goinFast1921();
		await genHarnessTeams({ rosters: [LAC, BUF] });
		const records = await simGames({ n: 50, coach: true });
		const timeouts = records
			.flatMap((r) => r.snaps)
			.filter((s) => s.deadTimeCase === "timeout");
		assert.ok(timeouts.length > 0, "no timeouts in 50 games");
		for (const s of timeouts) {
			assert.ok(
				s.kind !== "incompletion" &&
					s.kind !== "extraPoint" &&
					s.kind !== "twoPoint" &&
					s.ptsScored[0] + s.ptsScored[1] === 0,
				`timeout after a ${s.kind} (${s.ptsScored.join("-")} scored)`,
			);
		}
	}, 120_000);

	test("hurry-up snaps get the shorter hurry-up play length", async () => {
		const { LAC, BUF } = goinFast1921();
		await genHarnessTeams({ rosters: [LAC, BUF] });
		const records = await simGames({ n: 50, coach: true });
		const scrimmage = records
			.flatMap((r) => r.snaps)
			.filter((s) =>
				["run", "completion", "incompletion", "interception", "sack"].includes(
					s.kind,
				),
			);
		const hurried = scrimmage.filter((s) => s.hurriedSnap);
		const normal = scrimmage.filter((s) => !s.hurriedSnap);
		assert.ok(hurried.length > 100, `${hurried.length} hurried snaps`);

		for (const s of normal) {
			assert.ok(s.playTime! >= 4, `normal ${s.kind} took ${s.playTime}s`);
		}
		for (const s of hurried) {
			assert.ok(s.playTime! >= 3, `hurried ${s.kind} took ${s.playTime}s`);
		}
		const short =
			hurried.filter((s) => s.playTime! < 4).length / hurried.length;
		assert.ok(
			short > 0.15 && short < 0.35,
			`${(100 * short).toFixed(1)}% of hurried plays under 4s`,
		);
	}, 120_000);

	test("gameReport counts plays shorter than 4 seconds per game", () => {
		const snap = (playTime: number) => ({
			quarter: 1,
			clock: 10,
			offense: 0,
			kind: "run" as SnapKind,
			returned: false,
			hurryUp: false,
			ptsScored: [0, 0] as [number, number],
			newDrive: false,
			playTime,
		});
		const records: GameRecord[] = [
			{
				pts: [0, 0],
				overtimes: 0,
				coachPlayCalling: [true, true],
				// A 0s snap (touchback, extra point, pre-snap foul) isn't a short play
				snaps: [snap(3.2), snap(3.9), snap(4), snap(6), snap(0)],
			},
			{
				pts: [0, 0],
				overtimes: 0,
				coachPlayCalling: [true, true],
				snaps: [snap(5)],
			},
		];
		assert.strictEqual(gameReport(records).shortPlaysPerGame, 1);
	});

	test("gameReport counts drives, late-half points and clock stops per game", () => {
		const snap = (
			quarter: number,
			clock: number,
			offense: number,
			kind: SnapKind,
			{
				ptsScored = [0, 0],
				newDrive = false,
				hurryUp = false,
				stop,
			}: {
				ptsScored?: [number, number];
				newDrive?: boolean;
				hurryUp?: boolean;
				stop?: (typeof STOP_CAUSES)[number];
			},
		) => ({
			quarter,
			clock,
			offense,
			kind,
			returned: false,
			hurryUp,
			ptsScored,
			newDrive,
			stop,
		});

		const records: GameRecord[] = [
			{
				pts: [10, 3],
				overtimes: 0,
				coachPlayCalling: [true, true],
				snaps: [
					snap(1, 15, 1, "kickoff", { stop: "possessionChange" }),
					snap(1, 14.9, 0, "run", { newDrive: true }),
					snap(1, 14, 0, "completion", { ptsScored: [6, 0], stop: "score" }),
					snap(1, 13.9, 0, "extraPoint", { ptsScored: [1, 0], stop: "score" }),
					// Last 2:00 of the first half
					snap(2, 1.5, 1, "completion", {
						newDrive: true,
						hurryUp: true,
						stop: "outOfBounds",
					}),
					snap(2, 1, 1, "fieldGoal", { ptsScored: [0, 3], stop: "score" }),
					// 4th quarter, but not yet the last 2:00
					snap(4, 2.5, 0, "run", { newDrive: true, stop: "timeout" }),
					snap(4, 1.9, 0, "incompletion", { stop: "incompletion" }),
					snap(4, 1.8, 0, "fieldGoal", { ptsScored: [3, 0], stop: "score" }),
				],
			},
		];

		const report = gameReport(records);
		assert.strictEqual(report.games, 1);
		assert.strictEqual(report.ptsPerTeamGame, 6.5);
		assert.strictEqual(report.drivesPerTeamGame, 1.5);
		assert.strictEqual(report.ptsPerDrive, 13 / 3);
		assert.strictEqual(report.hurryUpSnapsPerGame, 1);
		assert.deepStrictEqual(report.lateHalfPtsPerGame, {
			firstHalf: 3,
			secondHalf: 3,
		});
		assert.deepStrictEqual(report.stopsPerGame, {
			twoMinuteWarning: 0,
			timeout: 1,
			score: 4,
			possessionChange: 1,
			incompletion: 1,
			penalty: 0,
			kneel: 0,
			outOfBounds: 1,
			other: 0,
		});
		assert.ok(formatGameReport(report).includes("drives / team-game"));
	});
});

describe("offense report", () => {
	test("snaps record the down, distance and the offense's stat line for the play", async () => {
		await genHarnessTeams();
		const records = await simGames({ n: 3, coach: true });
		for (const r of records) {
			for (const s of r.snaps) {
				if (
					s.newDrive &&
					["run", "completion", "incompletion"].includes(s.kind)
				) {
					assert.strictEqual(s.down, 1, "a drive starts on 1st down");
				}
				if (s.kind === "run" || s.kind === "completion") {
					assert.ok(s.toGo! >= 1 && s.down! >= 1 && s.down! <= 4);
				}
				// Rushing stats only come from runs (scrambles included), passing
				// stats only from throws -- a flag can wipe either out
				if (s.stat!.rus > 0) {
					assert.ok(["run", "kneel"].includes(s.kind), `rush on a ${s.kind}`);
				}
				if (s.stat!.pss > 0) {
					assert.ok(
						["completion", "incompletion", "interception"].includes(s.kind),
						`pass attempt on a ${s.kind}`,
					);
				}
				if (s.stat!.pssSk > 0) {
					assert.strictEqual(s.kind, "sack");
				}
			}
			for (const t of [0, 1]) {
				const plays = r.snaps
					.filter((s) => s.offense === t)
					.reduce(
						(sum, s) => sum + s.stat!.rus + s.stat!.pss + s.stat!.pssSk,
						0,
					);
				assert.ok(plays >= 35 && plays <= 95, `${plays} plays`);
			}
		}
	}, 60_000);

	test("offenseReport gives each team's efficiency and its 1st-down calls through the game", () => {
		const stat = (fields: Partial<Record<string, number>>) => ({
			rus: 0,
			rusYds: 0,
			pss: 0,
			pssYds: 0,
			pssSk: 0,
			pssSkYds: 0,
			...fields,
		});
		const snap = (
			offense: number,
			kind: SnapKind,
			down: number,
			fields: Partial<Record<string, number>>,
			{ quarter = 1, toGo = 10, newDrive = false, ptsScored = [0, 0] } = {},
		) => ({
			quarter,
			clock: 10,
			offense,
			kind,
			returned: false,
			hurryUp: false,
			ptsScored: ptsScored as [number, number],
			newDrive,
			down,
			toGo,
			stat: stat(fields),
		});
		const run = (offense: number, yds: number, down = 1, opts = {}) =>
			snap(offense, "run", down, { rus: 1, rusYds: yds }, opts);
		const pass = (offense: number, yds: number, down = 1, opts = {}) =>
			snap(offense, "completion", down, { pss: 1, pssYds: yds }, opts);

		const records: GameRecord[] = [
			{
				pts: [7, 0],
				overtimes: 0,
				coachPlayCalling: [true, true],
				snaps: [
					// Team 0: 5 runs and 5 passes on 1st down in Q1, before the ratio
					// kicks in (the 5th of each is taken with fewer than 5 banked)
					run(0, 2, 1, { newDrive: true }),
					run(0, 2),
					run(0, 2),
					run(0, 2),
					run(0, 2),
					pass(0, 10),
					pass(0, 10),
					pass(0, 10),
					pass(0, 10),
					pass(0, 10),
					// A sack counts as a dropback: 5 dropbacks + 1 sack for -6
					snap(0, "sack", 2, { pssSk: 1, pssSkYds: 6 }),
					// After the threshold, in Q2: 1 run and 3 passes on 1st down
					run(0, 2, 1, { quarter: 2 }),
					pass(0, 10, 1, { quarter: 2 }),
					pass(0, 10, 1, { quarter: 2 }),
					pass(0, 10, 1, { quarter: 2, ptsScored: [6, 0] }),
					// 1st and 15 and 4th-quarter snaps aren't ratio calls
					pass(0, 10, 1, { quarter: 1, toGo: 15 }),
					run(0, 2, 1, { quarter: 4 }),
					// Team 1: one run
					run(1, 4, 1, { newDrive: true }),
				],
			},
		];

		const report = offenseReport(records);
		const t0 = report.teams[0]!;
		assert.strictEqual(report.games, 1);
		assert.strictEqual(t0.ptsPerTeamGame, 7);
		assert.strictEqual(t0.drivesPerTeamGame, 1);
		assert.strictEqual(t0.playsPerTeamGame, 17);
		// 7 runs for 14 yards; 9 attempts for 90 yards and a sack for 6, per
		// dropback -- the same YPA the coach compares against
		assert.strictEqual(t0.ypc, 2);
		assert.strictEqual(t0.ypa, 84 / 10);
		assert.strictEqual(t0.passRate, 10 / 17);
		// 14 ratio calls: 10 before the threshold (5 passes), 4 after (3 passes)
		assert.strictEqual(t0.firstDown.callsPerTeamGame, 14);
		assert.strictEqual(t0.firstDown.beforeThresholdShare, 10 / 14);
		assert.strictEqual(t0.firstDown.passRateBeforeThreshold, 5 / 10);
		assert.strictEqual(t0.firstDown.passRateAfterThreshold, 3 / 4);
		assert.deepStrictEqual(t0.firstDown.passRateByQuarter, [0.5, 0.75, NaN]);

		const t1 = report.teams[1]!;
		assert.strictEqual(t1.ypc, 4);
		assert.ok(Number.isNaN(t1.ypa));
		assert.ok(formatOffenseReport(report, ["AAA", "BBB"]).includes("YPA"));
	});
});

// The clock experiments play real teams, the same two every run, so a
// before/after comparison isn't also a roster comparison: Goin Fast's LAC
// (team ovr 63) against BUF (44).

// SIM_TUNE='{"DEAD_TIME":{"penalty":{"mean":14,"min":6,"max":21}}}' overrides
// the clock tables in playClock.ts for one run, so tuning rounds can run side
// by side without editing the source. Merged two levels deep.
const applyTuning = () => {
	if (!process.env.SIM_TUNE) {
		return;
	}
	const tables: Record<string, Record<string, unknown>> = {
		BIG_PLAY_YARDS,
		DEAD_TIME,
		HURRY_UP_OUT_OF_BOUNDS_RATE,
		HURRY_UP_PLAY_LENGTH,
		LATE_WINDOW_MINUTES,
		LATE_WINDOW_RULES,
		OUT_OF_BOUNDS_RATE,
		PLAY_LENGTH,
	};
	const tune = JSON.parse(process.env.SIM_TUNE) as Record<
		string,
		Record<string, unknown>
	>;
	for (const [name, changes] of Object.entries(tune)) {
		const table = tables[name];
		if (!table) {
			throw new Error(`SIM_TUNE: unknown table ${name}`);
		}
		for (const [key, value] of Object.entries(changes)) {
			if (typeof value === "object" && value !== null) {
				Object.assign(table[key] as object, value);
			} else {
				table[key] = value;
			}
		}
	}
	process.stdout.write(`\nSIM_TUNE applied: ${process.env.SIM_TUNE}\n`);
};

// Experiment runner, skipped unless SIM_HARNESS is set:
//   SIM_HARNESS=1 SIM_GAMES=1000 npx vitest run --project football src/worker/core/GameSim.football/simHarness.test.ts -t "clock distribution"
test.skipIf(!process.env.SIM_HARNESS)(
	"experiment: clock distribution, coach play-calling",
	async () => {
		const n = Number(process.env.SIM_GAMES ?? 1000);
		applyTuning();

		const { LAC, BUF } = goinFast1921();
		await genHarnessTeams({ rosters: [LAC, BUF] });
		const records = await simGames({ n, coach: true });
		const clock = clockReport(records);
		const game = gameReport(records);

		process.stdout.write(
			`\n${formatClockReport(clock)}\n\n${formatGameReport(game)}\n\n`,
		);
		if (process.env.SIM_OUT) {
			writeFileSync(
				process.env.SIM_OUT,
				JSON.stringify({ clock, game }, null, 2),
			);
		}
	},
	60 * 60 * 1000,
);

// Experiment runner, skipped unless SIM_HARNESS is set:
//   SIM_HARNESS=1 SIM_TRIALS=2000 npx vitest run --project football src/worker/core/GameSim.football/simHarness.test.ts -t "comeback"
// The hurry-up guardrail: late-game situations replayed from a fixed state,
// coach play-calling on both sides. Run with each team trailing -- simFromState
// always gives the ball to tid 0.
test.skipIf(!process.env.SIM_HARNESS)(
	"experiment: comeback drives, coach play-calling",
	async () => {
		const n = Number(process.env.SIM_TRIALS ?? 2000);
		applyTuning();
		const { LAC, BUF } = goinFast1921();

		const results: Record<string, StateResult> = {};
		for (const [offense, defense] of [
			[LAC, BUF],
			[BUF, LAC],
		] as const) {
			await genHarnessTeams({ rosters: [offense, defense] });
			for (const clock of [2, 1]) {
				for (const timeouts of [3, 0]) {
					for (const diff of [-3, -7, -8]) {
						const label = `${offense.abbrev} ${clock}:00 left, ${timeouts} TO, down ${-diff}`;
						results[label] = await simFromState({
							n,
							coach: true,
							state: {
								down: 1,
								toGo: 10,
								scrimmage: 25,
								clock,
								quarter: 4,
								diff,
								timeouts: [timeouts, 3],
							},
						});
					}
				}
			}
		}

		process.stdout.write(`\n${formatStateResults(results)}\n\n`);
		if (process.env.SIM_OUT) {
			writeFileSync(process.env.SIM_OUT, JSON.stringify(results, null, 2));
		}
	},
	60 * 60 * 1000,
);

// Experiment runner, skipped unless SIM_HARNESS is set:
//   SIM_HARNESS=1 SIM_GAMES=2000 npx vitest run --project football src/worker/core/GameSim.football/simHarness.test.ts -t "offense by team"
// Each team's offense under coach play-calling, LAC vs BUF -- how fast the
// YPC vs YPA ratio steers 1st-down calls toward the better way to move the ball
test.skipIf(!process.env.SIM_HARNESS)(
	"experiment: offense by team, coach play-calling",
	async () => {
		const n = Number(process.env.SIM_GAMES ?? 1000);
		applyTuning();

		const { LAC, BUF } = goinFast1921();
		await genHarnessTeams({ rosters: [LAC, BUF] });

		const records = await simGames({ n, coach: true });
		const offense = offenseReport(records);
		const game = gameReport(records);

		process.stdout.write(
			`\n${formatOffenseReport(offense, ["LAC", "BUF"])}\n\n${formatGameReport(game)}\n\n`,
		);
		if (process.env.SIM_OUT) {
			writeFileSync(
				process.env.SIM_OUT,
				JSON.stringify({ offense, game }, null, 2),
			);
		}
	},
	60 * 60 * 1000,
);
