import { assert, beforeAll, test } from "vitest";
import { player, team } from "../core/index.ts";
import type { ValueChangeBreakdown } from "../core/team/valueChange.ts";
import { idb } from "../db/index.ts";
import { g, helpers, local } from "../util/index.ts";
import { resetCache, resetG } from "../../test/helpers.ts";
import { DEFAULT_LEVEL } from "../../common/budgetLevels.ts";
import tradeEval from "./tradeEval.ts";

// 3 teams, two players each: pids 0-1 on tid 0 (the user), 2-3 on tid 1, 4-5 on tid 2
beforeAll(async () => {
	resetG();
	local.leagueLoaded = true;
	g.setWithoutSavingToDB("numTeams", 3);
	g.setWithoutSavingToDB("numActiveTeams", 3);
	const teamsDefault = helpers.getTeamsDefault().slice(0, 3);
	const players = [];
	for (const [pid, tid] of [0, 0, 1, 1, 2, 2].entries()) {
		const p = player.generate(tid, 22 + 2 * pid, 2017, true, DEFAULT_LEVEL);
		await player.develop(p, 0);
		player.updateValues(p);
		players.push({ ...p, pid });
	}
	await resetCache({
		players,
		teams: teamsDefault.map(team.generate),
		teamSeasons: teamsDefault.map((t) => team.genSeasonRow(t)),
		teamStats: teamsDefault.map((t) => team.genStatsRow(t.tid)),
	});
});

const TRADES: [number[], number[]][] = [
	[[0], [2]],
	[[0, 1], [2]],
	[[1], []],
	[[], [3]],
	[[0], [2, 3]],
];

const sides = ([userPids, aiPids]: [number[], number[]]) =>
	[
		{ tid: 0, pids: userPids, dpids: [] },
		{ tid: 1, pids: aiPids, dpids: [] },
	] as [
		{ tid: number; pids: number[]; dpids: number[] },
		{ tid: number; pids: number[]; dpids: number[] },
	];

const snapshot = async () =>
	JSON.stringify({
		trade: await idb.cache.trade.getAll(),
		savedTrades: await idb.cache.savedTrades.getAll(),
		players: await idb.cache.players.getAll(),
		teams: await idb.cache.teams.getAll(),
		events: await idb.cache.events.getAll(),
	});

test("the breakdown hook leaves valueChange's result unchanged", async () => {
	for (const [userPids, aiPids] of TRADES) {
		const key = Math.random();
		const plain = await team.valueChange(1, userPids, aiPids, [], [], key, 0);
		const breakdown: ValueChangeBreakdown = {
			strategy: "",
			add: [],
			remove: [],
			sumAdd: 0,
			sumRemove: 0,
			dv: 0,
			estPicks: {},
			futureEstPicks: {},
		};
		const withBreakdown = await team.valueChange(
			1,
			userPids,
			aiPids,
			[],
			[],
			key,
			0,
			breakdown,
		);
		assert.strictEqual(withBreakdown, plain);
		assert.strictEqual(breakdown.dv, plain);
		assert.strictEqual(breakdown.add.length, userPids.length);
		assert.strictEqual(breakdown.remove.length, aiPids.length);
		const sum = (list: { contribution: number }[]) =>
			list.reduce((memo, a) => memo + a.contribution, 0);
		assert.strictEqual(sum(breakdown.add), breakdown.sumAdd);
		assert.strictEqual(sum(breakdown.remove), breakdown.sumRemove);
	}
});

test("evaluate matches valueChange called the way propose.ts calls it", async () => {
	for (const trade of TRADES) {
		const key = Math.random();
		const result = (await tradeEval.tradeEvalEvaluate({
			sides: sides(trade),
			valueChangeKey: key,
		})) as any;
		const dv = await team.valueChange(
			1,
			trade[0],
			trade[1],
			[],
			[],
			key,
			g.get("userTid"),
		);
		assert.strictEqual(result.aiTid, 1);
		assert.strictEqual(result.aiValuation.dv, dv);
		assert.strictEqual(
			result.wouldAccept,
			result.tradesAllowedNow && !result.cap.warning && dv > 0,
		);
	}
});

test("evaluate rejects assets that aren't on the sending team", async () => {
	const result = (await tradeEval.tradeEvalEvaluate({
		sides: sides([[2], [0]]),
	})) as any;
	assert.strictEqual(result.status, 400);
	assert.deepStrictEqual(result.ids, [2, 0]);
});

test("no endpoint changes league state", async () => {
	const before = await snapshot();
	for (let i = 0; i < 3; i++) {
		await tradeEval.tradeEvalContext();
		await tradeEval.tradeEvalEvaluate({ sides: sides(TRADES[1]!) });
		await tradeEval.tradeEvalBatch({
			trades: TRADES.map((t) => ({ sides: sides(t) })),
		});
		await tradeEval.tradeEvalMakeItWork({
			sides: sides([[], [2]]),
			holdUserConstant: false,
		});
		await tradeEval.tradeEvalBlockOffers({ pids: [0] });
		await tradeEval.tradeEvalSearch({
			aiTid: 1,
			aiPids: [2],
			userCandidatePids: [0, 1],
			maxUserAssets: 2,
			requireCapLegal: false,
		});
		await tradeEval.tradeEvalPlayerValue({ pid: 4 });
		await tradeEval.tradeEvalCapStatus({ tid: 2 });
	}
	assert.strictEqual(await snapshot(), before);
});

test("search returns only packages the AI accepts", async () => {
	const result = (await tradeEval.tradeEvalSearch({
		aiTid: 1,
		aiPids: [3],
		userCandidatePids: [0, 1],
		maxUserAssets: 2,
		requireCapLegal: false,
	})) as any;
	assert.strictEqual(result.truncated, false);
	assert.strictEqual(result.evaluated, 3);
	for (const r of result.results) {
		assert.isTrue(r.evaluation.wouldAccept);
		assert.isAbove(r.dvMargin, 0);
	}
});

test("every endpoint refuses when no league is loaded", async () => {
	local.leagueLoaded = false;
	try {
		const result = (await tradeEval.tradeEvalContext()) as any;
		assert.strictEqual(result.status, 503);
	} finally {
		local.leagueLoaded = true;
	}
});
