import { assert, describe, test } from "vitest";
import { writeFileSync } from "node:fs";
import { idb } from "../../db/index.ts";
import {
	ROSTER_TEMPLATE,
	formatSummaries,
	genHarnessTeams,
	setPosition,
	simGames,
	summarize,
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
		process.stdout.write(`
${formatSummaries(results)}

`);
		if (process.env.SIM_OUT) {
			writeFileSync(process.env.SIM_OUT, JSON.stringify(results, null, 2));
		}
	},
	60 * 60 * 1000,
);
