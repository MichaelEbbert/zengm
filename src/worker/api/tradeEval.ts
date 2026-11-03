// Read-only trade evaluation API (TRADE-EVAL-API-SPEC.md), served by the Electron
// API server in electron/main.js. Every function here must leave league state
// untouched: no writes to idb.cache, no events, no toUI. Only engine functions
// that read are called (trade.summary, trade.makeItWork, team.valueChange,
// team.getPayroll, player.updateOvrMeanStd), and trade teams are deep-copied
// first because some helpers mutate their argument.

import { PHASE } from "../../common/constants.ts";
import type { DraftPick, Player, TradeTeams } from "../../common/types.ts";
import { player, team, trade } from "../core/index.ts";
import type { LookingFor } from "../core/trade/makeItWork.ts";
import type {
	AssetDetail,
	ValueChangeBreakdown,
} from "../core/team/valueChange.ts";
import { idb } from "../db/index.ts";
import { g, helpers, local, lock } from "../util/index.ts";

type TradeSide = { tid: number; pids?: number[]; dpids?: number[] };
type ApiError = { error: string; status: number; ids?: number[] };

const MAX_BATCH = 500;
const MAX_SEARCH_EVALUATIONS = 20000;

// No league open (league list, or mid-load): the cache would wait forever, so
// refuse instead. Reported as busy-style refusals by every endpoint.
const notReady = () => !local.leagueLoaded;
const isBusy = () =>
	notReady() ||
	lock.get("gameSim") ||
	lock.get("newPhase") ||
	lock.get("drafting");
const BUSY: ApiError = { error: "busy", status: 409 };
const NO_LEAGUE: ApiError = { error: "no league loaded", status: 503 };

const newKey = () => Math.random();

const tradesAllowedNow = () =>
	!(
		g.get("phase") >= PHASE.AFTER_TRADE_DEADLINE &&
		g.get("phase") <= PHASE.PLAYOFFS
	);

const emptyBreakdown = (): ValueChangeBreakdown => ({
	strategy: "",
	add: [],
	remove: [],
	sumAdd: 0,
	sumRemove: 0,
	dv: 0,
	estPicks: {},
	futureEstPicks: {},
});

const abbrev = (tid: number) => g.get("teamInfoCache")[tid]?.abbrev ?? `${tid}`;

const toTradeTeams = (sides: [TradeSide, TradeSide]): TradeTeams =>
	sides.map((side) => ({
		tid: side.tid,
		pids: [...(side.pids ?? [])],
		pidsExcluded: [],
		dpids: [...(side.dpids ?? [])],
		dpidsExcluded: [],
	})) as TradeTeams;

// Each pid must be on its side's team and each dpid owned by it
const validate = async (
	sides: [TradeSide, TradeSide] | undefined,
): Promise<ApiError | undefined> => {
	if (!Array.isArray(sides) || sides.length !== 2) {
		return { error: "sides must have exactly two entries", status: 400 };
	}
	const bad: number[] = [];
	for (const side of sides) {
		if (!(await idb.cache.teams.get(side.tid))) {
			return { error: `unknown tid ${side.tid}`, status: 400 };
		}
		for (const pid of side.pids ?? []) {
			const p = await idb.cache.players.get(pid);
			if (!p || p.tid !== side.tid) {
				bad.push(pid);
			}
		}
		for (const dpid of side.dpids ?? []) {
			const dp = await idb.cache.draftPicks.get(dpid);
			if (!dp || dp.tid !== side.tid) {
				bad.push(dpid);
			}
		}
	}
	if (bad.length > 0) {
		return {
			error: "these pids/dpids don't belong to the side that sends them",
			status: 400,
			ids: bad,
		};
	}
	return undefined;
};

const describePlayer = (p: Player) => {
	const r = p.ratings.at(-1)!;
	return {
		name: `${p.firstName} ${p.lastName}`,
		pos: r.pos,
		age: g.get("season") - p.born.year,
		ovr: r.ovr,
		pot: r.pot,
		ovrFuzzed: player.fuzzRating(r.ovr, r.fuzz),
		potFuzzed: player.fuzzRating(r.pot, r.fuzz),
		pValue: p.value,
		contract: { amount: p.contract.amount, exp: p.contract.exp },
		injury: {
			type: p.injury.type,
			gamesRemaining: p.injury.gamesRemaining,
		},
		...trade.isUntradable(p),
	};
};

const describePick = async (dp: DraftPick) => ({
	season: dp.season,
	round: dp.round,
	pick: dp.pick,
	originalTid: dp.originalTid,
	originalAbbrev: abbrev(dp.originalTid),
	desc: await helpers.pickDesc(dp, "short"),
	untradable: false,
});

const describeAsset = async (detail: AssetDetail) => {
	const base = {
		kind: detail.type,
		...detail,
		strategyFactor:
			detail.value !== 0 ? detail.afterStrategy / detail.value : 1,
	};
	if (detail.type === "player" && detail.pid !== undefined) {
		const p = await idb.cache.players.get(detail.pid);
		return p ? { ...base, ...describePlayer(p) } : base;
	}
	if (detail.dpid !== undefined) {
		const dp = await idb.cache.draftPicks.get(detail.dpid);
		return dp ? { ...base, ...(await describePick(dp)) } : base;
	}
	return base;
};

const teamValuation = async (tid: number, breakdown: ValueChangeBreakdown) => ({
	tid,
	abbrev: abbrev(tid),
	strategy: breakdown.strategy,
	add: await Promise.all(breakdown.add.map(describeAsset)),
	remove: await Promise.all(breakdown.remove.map(describeAsset)),
	sumAdd: breakdown.sumAdd,
	sumRemove: breakdown.sumRemove,
	dv: breakdown.dv,
});

// valueChange from tid's side: it receives what the other side sends
const valueFor = async (
	teams: TradeTeams,
	i: 0 | 1,
	key: number,
	breakdown?: ValueChangeBreakdown,
) => {
	const j = i === 0 ? 1 : 0;
	return team.valueChange(
		teams[i].tid,
		teams[j].pids,
		teams[i].pids,
		teams[j].dpids,
		teams[i].dpids,
		key,
		teams[j].tid,
		breakdown,
	);
};

const aiIndexFor = (teams: TradeTeams, perspectiveTid?: number): 0 | 1 => {
	if (perspectiveTid !== undefined) {
		return teams[0].tid === perspectiveTid ? 0 : 1;
	}
	return teams[0].tid !== g.get("userTid") && teams[1].tid === g.get("userTid")
		? 0
		: 1;
};

const rejectionMessage = (dv: number) =>
	dv > -2
		? "Close, but not quite good enough."
		: dv > -5
			? "That's not a good deal for me."
			: "What, are you crazy?!";

const evaluate = async (
	teamsIn: TradeTeams,
	{
		key,
		perspectiveTid,
		compact = false,
	}: { key: number; perspectiveTid?: number; compact?: boolean },
) => {
	const teams = helpers.deepCopy(teamsIn);
	const aiIndex = aiIndexFor(teams, perspectiveTid);
	const userIndex = aiIndex === 0 ? 1 : 0;

	const s = await trade.summary(helpers.deepCopy(teams));

	const aiBreakdown = emptyBreakdown();
	const dv = await valueFor(teams, aiIndex, key, aiBreakdown);

	const untradable: string[] = [];
	for (const side of teams) {
		for (const pid of side.pids) {
			const p = await idb.cache.players.get(pid);
			if (p) {
				const u = trade.isUntradable(p);
				if (u.untradable) {
					untradable.push(
						`${p.firstName} ${p.lastName} (${pid}): ${u.untradableMsg}`,
					);
				}
			}
		}
	}

	const allowed = tradesAllowedNow();
	const blockers: string[] = [];
	if (!allowed) {
		blockers.push("Trades aren't allowed in this phase");
	}
	if (s.warning) {
		blockers.push(s.warning);
	}
	blockers.push(...untradable);
	if (dv <= 0) {
		blockers.push(`AI value change ${dv.toFixed(3)} is not positive`);
	}
	const wouldAccept =
		allowed && !s.warning && untradable.length === 0 && dv > 0;

	const salaryCap = g.get("salaryCap");
	const capTeams = ([0, 1] as const).map((i) => {
		const before = Math.round(s.teams[i].payrollBeforeTrade * 1000);
		const after = Math.round(s.teams[i].payrollAfterTrade * 1000);
		return {
			tid: teams[i].tid,
			payrollBefore: before,
			payrollAfter: after,
			overCapAfter: after > salaryCap,
			payrollIncreases: after > before,
		};
	});
	const capType = g.get("salaryCapType");
	const cap = {
		salaryCap,
		salaryCapType: capType,
		teams: capTeams,
		warning: s.warning,
		warningAmount: s.warningAmount,
		rule: !s.warning
			? "ok"
			: capType === "hard"
				? "hardCapOverAndIncreasing"
				: "softCapSalaryMatch",
	};

	// trade.summary stores each team's ovr under the other team's index, and the
	// trade screen reads it crossed (summary.teams[t.other]), so cross it here too
	const teamOvr = ([0, 1] as const).map((i) => ({
		tid: teams[i].tid,
		before: s.teams[i === 0 ? 1 : 0].ovrBefore,
		after: s.teams[i === 0 ? 1 : 0].ovrAfter,
	}));

	if (compact) {
		return {
			wouldAccept,
			dv,
			aiTid: teams[aiIndex].tid,
			cap: { warning: s.warning, rule: cap.rule },
			teamOvr,
			blockers,
		};
	}

	const rosterTeams = [];
	for (const i of [0, 1] as const) {
		const j = i === 0 ? 1 : 0;
		const before = (
			await idb.cache.players.indexGetAll("playersByTid", teams[i].tid)
		).length;
		rosterTeams.push({
			tid: teams[i].tid,
			before,
			after: before - teams[i].pids.length + teams[j].pids.length,
		});
	}

	const userBreakdown = emptyBreakdown();
	await valueFor(teams, userIndex, key, userBreakdown);

	return {
		tradesAllowedNow: allowed,
		phase: g.get("phase"),
		season: g.get("season"),
		valueChangeKey: key,
		aiTid: teams[aiIndex].tid,
		aiValuation: await teamValuation(teams[aiIndex].tid, aiBreakdown),
		userValuation: await teamValuation(teams[userIndex].tid, userBreakdown),
		cap,
		roster: {
			maxRosterSize: g.get("maxRosterSize"),
			minRosterSize: g.get("minRosterSize"),
			teams: rosterTeams,
		},
		teamOvr,
		wouldAccept,
		rejectionMessage: wouldAccept
			? null
			: dv <= 0
				? rejectionMessage(dv)
				: (blockers[0] ?? null),
		blockers,
	};
};

const teamOvrNow = async (tid: number) => {
	const players = await idb.cache.players.indexGetAll("playersByTid", tid);
	const copies = await idb.getCopies.playersPlus(players, {
		attrs: ["injury", "pid", "value"],
		fuzz: true,
		ratings: ["ovr", "pos", "ovrs"],
		season: g.get("season"),
	});
	return team.ovr(copies);
};

// Rank order each team's pick is expected at, from the valuation's own cache
const estPicksFor = async (key: number) => {
	const breakdown = emptyBreakdown();
	await team.valueChange(
		g.get("userTid"),
		[],
		[],
		[],
		[],
		key,
		undefined,
		breakdown,
	);
	return breakdown;
};

const capStatusFor = async (tid: number, estPick?: number) => {
	const t = await idb.cache.teams.get(tid);
	const payroll = await team.getPayroll(tid);
	const released = await idb.cache.releasedPlayers.indexGetAll(
		"releasedPlayersByTid",
		tid,
	);
	return {
		tid,
		abbrev: abbrev(tid),
		strategy: t?.strategy,
		payroll,
		capSpace: g.get("salaryCap") - payroll,
		releasedPlayersSalary: released.reduce(
			(sum, rp) => sum + rp.contract.amount,
			0,
		),
		rosterSize: (await idb.cache.players.indexGetAll("playersByTid", tid))
			.length,
		teamOvr: await teamOvrNow(tid),
		estPick,
	};
};

const toLookingFor = (raw: any): LookingFor | undefined => {
	if (!raw) {
		return undefined;
	}
	return {
		positions: new Set<string>(raw.positions ?? []),
		skills: new Set<string>(raw.skills ?? []),
		draftPicks: !!raw.draftPicks,
		prospects: !!raw.prospects,
		bestCurrentPlayers: !!raw.bestCurrentPlayers,
	};
};

const fromTradeTeams = (teams: TradeTeams) =>
	teams.map((t) => ({ tid: t.tid, pids: t.pids, dpids: t.dpids }));

// 5.1
const tradeEvalContext = async () => {
	if (isBusy()) {
		return notReady() ? NO_LEAGUE : BUSY;
	}
	await player.updateOvrMeanStd();
	const key = newKey();
	const { estPicks } = await estPicksFor(key);
	const teams = (await idb.cache.teams.getAll()).filter((t) => !t.disabled);
	return {
		season: g.get("season"),
		phase: g.get("phase"),
		daysLeft: g.get("daysLeft"),
		userTid: g.get("userTid"),
		numActiveTeams: g.get("numActiveTeams"),
		numDraftRounds: g.get("numDraftRounds"),
		salaryCap: g.get("salaryCap"),
		salaryCapType: g.get("salaryCapType"),
		minContract: g.get("minContract"),
		maxContract: g.get("maxContract"),
		maxRosterSize: g.get("maxRosterSize"),
		minRosterSize: g.get("minRosterSize"),
		difficulty: g.get("difficulty"),
		playerOvrMean: local.playerOvrMean,
		playerOvrStd: local.playerOvrStd,
		exponent: 3,
		tradesAllowedNow: tradesAllowedNow(),
		valueChangeKey: key,
		teams: await Promise.all(
			teams.map((t) => capStatusFor(t.tid, estPicks[t.tid])),
		),
	};
};

// 5.2
const tradeEvalEvaluate = async ({
	sides,
	perspectiveTid,
	valueChangeKey,
}: {
	sides: [TradeSide, TradeSide];
	perspectiveTid?: number;
	valueChangeKey?: number;
}) => {
	if (isBusy()) {
		return notReady() ? NO_LEAGUE : BUSY;
	}
	const invalid = await validate(sides);
	if (invalid) {
		return invalid;
	}
	return evaluate(toTradeTeams(sides), {
		key: valueChangeKey ?? newKey(),
		perspectiveTid,
	});
};

// 5.3
const tradeEvalBatch = async ({
	trades,
	perspectiveTid,
	compact = false,
}: {
	trades: { sides: [TradeSide, TradeSide] }[];
	perspectiveTid?: number;
	compact?: boolean;
}) => {
	if (isBusy()) {
		return notReady() ? NO_LEAGUE : BUSY;
	}
	if (!Array.isArray(trades) || trades.length > MAX_BATCH) {
		return {
			error: `trades must be an array of at most ${MAX_BATCH}`,
			status: 400,
		};
	}
	const key = newKey();
	const results = [];
	for (const [i, t] of trades.entries()) {
		const invalid = await validate(t.sides);
		results.push(
			invalid
				? { index: i, ...invalid }
				: await evaluate(toTradeTeams(t.sides), {
						key,
						perspectiveTid,
						compact,
					}),
		);
	}
	return { valueChangeKey: key, results };
};

// 5.4
const tradeEvalMakeItWork = async ({
	sides,
	holdUserConstant,
	maxAssetsToAdd,
	lookingFor,
	excludePids = [],
	excludeDpids = [],
	maxIncomingSalary,
}: {
	sides: [TradeSide, TradeSide];
	holdUserConstant: boolean;
	maxAssetsToAdd?: number;
	lookingFor?: unknown;
	excludePids?: number[];
	excludeDpids?: number[];
	maxIncomingSalary?: number;
}) => {
	if (isBusy()) {
		return notReady() ? NO_LEAGUE : BUSY;
	}
	const invalid = await validate(sides);
	if (invalid) {
		return invalid;
	}
	const key = newKey();
	const teams = toTradeTeams(sides);
	teams[0].pidsExcluded = [...excludePids];
	teams[0].dpidsExcluded = [...excludeDpids];
	const aiPidsBefore = new Set(teams[1].pids);

	for (let attempt = 0; attempt < 10; attempt++) {
		const result = await trade.makeItWork(helpers.deepCopy(teams), {
			holdUserConstant: !!holdUserConstant,
			maxAssetsToAdd,
			lookingFor: toLookingFor(lookingFor),
			valueChangeKey: key,
		});
		if (!result) {
			return {
				found: false,
				message: "I can't afford to give up so much.",
			};
		}

		if (maxIncomingSalary !== undefined) {
			const added = [];
			for (const pid of result[1].pids) {
				const p = await idb.cache.players.get(pid);
				if (p && !aiPidsBefore.has(pid)) {
					added.push(p);
				}
			}
			const incoming = added.reduce((sum, p) => sum + p.contract.amount, 0);
			if (incoming > maxIncomingSalary && added.length > 0) {
				const priciest = added.reduce((a, b) =>
					b.contract.amount > a.contract.amount ? b : a,
				);
				teams[1].pidsExcluded.push(priciest.pid);
				continue;
			}
		}

		return {
			found: true,
			sides: fromTradeTeams(result),
			evaluation: await evaluate(result, { key }),
		};
	}
	return {
		found: false,
		message: "No offer under maxIncomingSalary after 10 tries",
	};
};

// 5.5
const tradeEvalBlockOffers = async ({
	pids = [],
	dpids = [],
	lookingFor,
}: {
	pids?: number[];
	dpids?: number[];
	lookingFor?: unknown;
}) => {
	if (isBusy()) {
		return notReady() ? NO_LEAGUE : BUSY;
	}
	const userTid = g.get("userTid");
	const invalid = await validate([
		{ tid: userTid, pids, dpids },
		{ tid: userTid, pids: [], dpids: [] },
	]);
	if (invalid) {
		return invalid;
	}
	const key = newKey();
	const tids = (await idb.cache.teams.getAll())
		.filter((t) => !t.disabled && t.tid !== userTid)
		.map((t) => t.tid);

	// Same loop as getOffers in api/index.ts, without saving lookingFor
	const offers = [];
	for (const tid of tids) {
		const teams: TradeTeams = [
			{
				tid: userTid,
				pids: [...pids],
				pidsExcluded: [],
				dpids: [...dpids],
				dpidsExcluded: [],
			},
			{ tid, pids: [], pidsExcluded: [], dpids: [], dpidsExcluded: [] },
		];
		const result = await trade.makeItWork(teams, {
			holdUserConstant: true,
			maxAssetsToAdd: 4 + pids.length + dpids.length,
			lookingFor: toLookingFor(lookingFor),
			valueChangeKey: key,
		});
		if (result) {
			const evaluation = await evaluate(result, { key });
			offers.push({
				tid,
				abbrev: abbrev(tid),
				sides: fromTradeTeams(result),
				capLegal: !evaluation.cap.warning,
				evaluation,
			});
		}
	}
	return {
		valueChangeKey: key,
		offers: offers.length,
		legalOffers: offers.filter((o) => o.capLegal).length,
		results: offers,
	};
};

// 5.6
function* subsets<T>(items: T[], maxSize: number): Generator<T[]> {
	const n = items.length;
	const pick = (start: number, chosen: T[]): Generator<T[]> =>
		(function* () {
			if (chosen.length > 0) {
				yield chosen;
			}
			if (chosen.length === maxSize) {
				return;
			}
			for (let i = start; i < n; i++) {
				yield* pick(i + 1, [...chosen, items[i]!]);
			}
		})();
	yield* pick(0, []);
}

const tradeEvalSearch = async ({
	aiTid,
	aiPids = [],
	aiDpids = [],
	aiOptionalPids = [],
	userCandidatePids = [],
	userCandidateDpids = [],
	userMustInclude = [],
	maxUserAssets = 3,
	requireCapLegal = true,
	maxResults = 25,
	sortBy = ["userTeamOvrLoss", "userOutgoingValue", "dvMargin"],
}: {
	aiTid: number;
	aiPids?: number[];
	aiDpids?: number[];
	aiOptionalPids?: number[];
	userCandidatePids?: number[];
	userCandidateDpids?: number[];
	userMustInclude?: number[];
	maxUserAssets?: number;
	requireCapLegal?: boolean;
	maxResults?: number;
	sortBy?: string[];
}) => {
	if (isBusy()) {
		return notReady() ? NO_LEAGUE : BUSY;
	}
	const userTid = g.get("userTid");
	const invalid = await validate([
		{
			tid: userTid,
			pids: [...userCandidatePids, ...userMustInclude],
			dpids: userCandidateDpids,
		},
		{ tid: aiTid, pids: [...aiPids, ...aiOptionalPids], dpids: aiDpids },
	]);
	if (invalid) {
		return invalid;
	}

	type Candidate = { kind: "pid" | "dpid"; id: number };
	const candidates: Candidate[] = [
		...userCandidatePids
			.filter((pid) => !userMustInclude.includes(pid))
			.map((id) => ({ kind: "pid" as const, id })),
		...userCandidateDpids.map((id) => ({ kind: "dpid" as const, id })),
	];
	const freeSlots = Math.max(0, maxUserAssets - userMustInclude.length);
	const userSets: Candidate[][] = userMustInclude.length > 0 ? [[]] : [];
	for (const set of subsets(candidates, freeSlots)) {
		userSets.push(set);
	}
	const aiSets: number[][] = [[]];
	for (const set of subsets(aiOptionalPids, aiOptionalPids.length)) {
		aiSets.push(set);
	}

	const total = userSets.length * aiSets.length;
	if (total > MAX_SEARCH_EVALUATIONS) {
		return {
			truncated: true,
			evaluationsNeeded: total,
			limit: MAX_SEARCH_EVALUATIONS,
			results: [],
		};
	}

	const key = newKey();
	const userIndex = 0;
	const accepted = [];
	for (const userSet of userSets) {
		for (const aiSet of aiSets) {
			const teams: TradeTeams = [
				{
					tid: userTid,
					pids: [
						...userMustInclude,
						...userSet.filter((c) => c.kind === "pid").map((c) => c.id),
					],
					pidsExcluded: [],
					dpids: userSet.filter((c) => c.kind === "dpid").map((c) => c.id),
					dpidsExcluded: [],
				},
				{
					tid: aiTid,
					pids: [...aiPids, ...aiSet],
					pidsExcluded: [],
					dpids: [...aiDpids],
					dpidsExcluded: [],
				},
			];

			// Cheap check first; the full evaluation only for deals the AI takes
			const dv = await valueFor(teams, 1, key);
			if (dv <= 0) {
				continue;
			}
			const evaluation = await evaluate(teams, { key, compact: true });
			if (!evaluation.wouldAccept) {
				continue;
			}
			if (requireCapLegal && evaluation.cap.warning) {
				continue;
			}

			const userBreakdown = emptyBreakdown();
			await valueFor(teams, userIndex, key, userBreakdown);
			const userOutgoingValue = userBreakdown.remove.reduce(
				(sum, a) => sum + a.contribution,
				0,
			);
			const ovr = evaluation.teamOvr[userIndex]!;
			accepted.push({
				sides: fromTradeTeams(teams),
				userTeamOvrLoss: ovr.before - ovr.after,
				userOutgoingValue,
				dvMargin: dv,
				evaluation,
			});
		}
	}

	const sortKeys = sortBy.filter((k) =>
		["userTeamOvrLoss", "userOutgoingValue", "dvMargin"].includes(k),
	) as ("userTeamOvrLoss" | "userOutgoingValue" | "dvMargin")[];
	accepted.sort((a, b) => {
		for (const k of sortKeys) {
			if (a[k] !== b[k]) {
				return a[k] - b[k];
			}
		}
		return 0;
	});

	return {
		valueChangeKey: key,
		evaluated: total,
		accepted: accepted.length,
		truncated: false,
		results: accepted.slice(0, maxResults),
	};
};

// Perspective teams for a single-asset value: the given team, or one AI team of each strategy
const perspectiveTids = async (
	perspectiveTid: number | undefined,
	ownerTid: number,
) => {
	if (perspectiveTid !== undefined) {
		return [perspectiveTid];
	}
	const teams = (await idb.cache.teams.getAll()).filter(
		(t) => !t.disabled && t.tid !== g.get("userTid") && t.tid !== ownerTid,
	);
	const tids = [];
	for (const strategy of ["contending", "rebuilding"]) {
		const t = teams.find((t2) => t2.strategy === strategy);
		if (t) {
			tids.push(t.tid);
		}
	}
	return tids;
};

// 5.7
const tradeEvalPlayerValue = async ({
	pid,
	perspectiveTid,
}: {
	pid: number;
	perspectiveTid?: number;
}) => {
	if (isBusy()) {
		return notReady() ? NO_LEAGUE : BUSY;
	}
	const p = await idb.cache.players.get(pid);
	if (!p) {
		return { error: `unknown pid ${pid}`, status: 404 };
	}
	const key = newKey();
	const values = [];
	for (const tid of await perspectiveTids(perspectiveTid, p.tid)) {
		const breakdown = emptyBreakdown();
		await team.valueChange(tid, [pid], [], [], [], key, p.tid, breakdown);
		values.push({
			perspectiveTid: tid,
			abbrev: abbrev(tid),
			strategy: breakdown.strategy,
			asset: breakdown.add[0] ? await describeAsset(breakdown.add[0]) : null,
		});
	}
	return { pid, tid: p.tid, ...describePlayer(p), values };
};

// 5.8
const tradeEvalPickValue = async ({
	dpid,
	perspectiveTid,
}: {
	dpid: number;
	perspectiveTid?: number;
}) => {
	if (isBusy()) {
		return notReady() ? NO_LEAGUE : BUSY;
	}
	const dp = await idb.cache.draftPicks.get(dpid);
	if (!dp) {
		return { error: `unknown dpid ${dpid}`, status: 404 };
	}
	const key = newKey();
	const values = [];
	for (const tid of await perspectiveTids(perspectiveTid, dp.tid)) {
		const breakdown = emptyBreakdown();
		await team.valueChange(tid, [], [], [dpid], [], key, dp.tid, breakdown);
		const futureDraft =
			typeof dp.season === "number" && dp.season > g.get("season");
		values.push({
			perspectiveTid: tid,
			abbrev: abbrev(tid),
			strategy: breakdown.strategy,
			// Original team's rank before regression and the user/AI adjustments
			rankEstimate: (futureDraft
				? breakdown.futureEstPicks
				: breakdown.estPicks)[dp.originalTid],
			asset: breakdown.add[0] ? await describeAsset(breakdown.add[0]) : null,
		});
	}
	return { dpid, tid: dp.tid, ...(await describePick(dp)), values };
};

// 5.9
const tradeEvalCapStatus = async ({ tid }: { tid: number }) => {
	if (isBusy()) {
		return notReady() ? NO_LEAGUE : BUSY;
	}
	if (!(await idb.cache.teams.get(tid))) {
		return { error: `unknown tid ${tid}`, status: 404 };
	}
	const { estPicks } = await estPicksFor(newKey());
	return capStatusFor(tid, estPicks[tid]);
};

export default {
	tradeEvalBatch,
	tradeEvalBlockOffers,
	tradeEvalCapStatus,
	tradeEvalContext,
	tradeEvalEvaluate,
	tradeEvalMakeItWork,
	tradeEvalPickValue,
	tradeEvalPlayerValue,
	tradeEvalSearch,
};
