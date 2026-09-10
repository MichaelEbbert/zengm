// Throwaway game simulation for experiments: two generated teams held in the
// test cache, any number of games, nothing persisted. Used from
// simHarness.test.ts, which only runs its experiment when SIM_HARNESS is set.

import GameSim from "./index.ts";
import Play from "./Play.ts";
import loadTeams from "../game/loadTeams.ts";
import ovr from "../player/ovr.football.ts";
import { player, team } from "../index.ts";
import { idb } from "../../db/index.ts";
import { g, helpers } from "../../util/index.ts";
import { resetCache, resetG } from "../../../test/helpers.ts";
import { DEFAULT_LEVEL } from "../../../common/budgetLevels.ts";
import { PLAYER } from "../../../common/constants.ts";
import { POSITIONS, RATINGS } from "../../../common/constants.football.ts";
import type { Position } from "../../../common/types.football.ts";

// 50 players, one K and one P, enough depth everywhere for fatigue rotation
export const ROSTER_TEMPLATE: Record<string, number> = {
	QB: 3,
	RB: 4,
	WR: 6,
	TE: 3,
	OL: 9,
	DL: 8,
	LB: 6,
	CB: 5,
	S: 4,
	K: 1,
	P: 1,
};

type Ratings = Record<string, any>;

/**
 * Two teams (tids 0 and 1) built from ROSTER_TEMPLATE with random 25-year-olds,
 * depth charts auto-sorted. Replaces whatever was in the cache.
 */
export const genHarnessTeams = async () => {
	resetG();
	g.setWithoutSavingToDB("season", 2013);
	const teamsDefault = helpers.getTeamsDefault().slice(0, 2);

	// player.generate can't force a position, so draw until every quota is met
	const players = [];
	for (const tid of [0, 1]) {
		const need = { ...ROSTER_TEMPLATE };
		for (let i = 0; Object.values(need).some((n) => n > 0); i++) {
			if (i > 20000) {
				throw new Error("Could not fill ROSTER_TEMPLATE");
			}
			const p = player.generate(tid, 25, 2010, true, DEFAULT_LEVEL);
			const pos = p.ratings.at(-1)!.pos;
			if ((need[pos] ?? 0) > 0) {
				need[pos]! -= 1;
				// generate leaves ovr at 0 for develop to fill in. Depth charts sort
				// on ovrs and the sim blends them into team composites, so set them
				// here -- without develop, which would also age the player and could
				// move him off the position we drew him for.
				recomputeOvrs(p.ratings.at(-1)!);
				players.push(p);
			}
		}
	}

	await resetCache({
		players,
		teams: teamsDefault.map(team.generate),
		teamSeasons: teamsDefault.map((t) => team.genSeasonRow(t)),
		teamStats: teamsDefault.map((t) => team.genStatsRow(t.tid)),
	});

	for (const tid of [0, 1]) {
		await team.rosterAutoSort(tid);
	}
};

/**
 * A slot in setPosition: a target ovr at that position, or raw ratings. Both
 * may be given -- the ovr is hit first by setting every raw rating to one
 * uniform value, then the raw overrides are applied on top (so they can move
 * the ovr off target).
 */
export type PlayerSpec =
	| number
	| {
			ovr?: number;
			ratings?: Partial<Record<(typeof RATINGS)[number], number>>;
	  };

const recomputeOvrs = (ratings: Ratings) => {
	ratings.ovrs = Object.fromEntries(
		POSITIONS.map((pos) => [pos, ovr(ratings as any, pos)]),
	);
	ratings.ovr = ratings.ovrs[ratings.pos];
};

// Smallest uniform raw rating whose ovr at pos reaches target, or the one just
// below it if that lands closer
const uniformRatingForOvr = (
	ratings: Ratings,
	pos: Position,
	target: number,
) => {
	const ovrAt = (value: number) => {
		const r = { ...ratings };
		for (const key of RATINGS) {
			r[key] = value;
		}
		return ovr(r as any, pos);
	};

	let lo = 0;
	let hi = 100;
	while (lo < hi) {
		const mid = Math.floor((lo + hi) / 2);
		if (ovrAt(mid) < target) {
			lo = mid + 1;
		} else {
			hi = mid;
		}
	}

	if (lo > 0 && target - ovrAt(lo - 1) < ovrAt(lo) - target) {
		return lo - 1;
	}
	return lo;
};

/**
 * Make a team's position group exactly `specs`, in depth order. The first
 * specs.length natural players at pos are rewritten; any beyond that are
 * released so they can't take snaps there. Returns the pids in depth order.
 */
export const setPosition = async (
	tid: number,
	pos: Position,
	specs: PlayerSpec[],
) => {
	const players = await idb.cache.players.indexGetAll("playersByTid", tid);
	const group = players.filter((p) => p.ratings.at(-1)!.pos === pos);
	if (group.length < specs.length) {
		throw new Error(
			`setPosition: tid ${tid} has ${group.length} ${pos}, spec asks for ${specs.length}`,
		);
	}

	const pids: number[] = [];
	for (const [i, spec] of specs.entries()) {
		const p = group[i]!;
		const ratings: Ratings = p.ratings.at(-1)!;
		const { ovr: target, ratings: overrides } =
			typeof spec === "number" ? { ovr: spec, ratings: undefined } : spec;

		if (target !== undefined) {
			const value = uniformRatingForOvr(ratings, pos, target);
			for (const key of RATINGS) {
				ratings[key] = value;
			}
		}
		if (overrides) {
			Object.assign(ratings, overrides);
		}

		ratings.pos = pos;
		recomputeOvrs(ratings);
		await idb.cache.players.put(p);
		pids.push(p.pid);
	}

	for (const p of group.slice(specs.length)) {
		p.tid = PLAYER.FREE_AGENT;
		await idb.cache.players.put(p);
	}

	await team.rosterAutoSort(tid);

	// Auto-sort ranks the whole roster, so pin the spec players to the top in
	// spec order rather than trusting the sort
	const t = (await idb.cache.teams.get(tid))!;
	const depth = t.depth as Record<string, number[]>;
	depth[pos] = [...pids, ...depth[pos]!.filter((pid) => !pids.includes(pid))];
	await idb.cache.teams.put(t);

	return pids;
};

export type SnapKind =
	| "run"
	| "completion"
	| "incompletion"
	| "interception"
	| "sack"
	| "kneel"
	| "kickoff"
	| "punt"
	| "fieldGoal"
	| "extraPoint"
	| "twoPoint"
	| "penalty"
	| "other";

const OFFENSIVE_KINDS = new Set<SnapKind>([
	"run",
	"completion",
	"incompletion",
	"interception",
	"sack",
	"kneel",
]);
const PASS_KINDS = new Set<SnapKind>([
	"completion",
	"incompletion",
	"interception",
	"sack",
]);

export type Snap = {
	quarter: number;
	// Game clock at the snap, in minutes
	clock: number;
	offense: number;
	kind: SnapKind;
	// Kick or punt that was returned rather than a touchback
	returned: boolean;
	// Seconds of game clock until the next snap in the same period
	gap?: number;
};

export type GameRecord = {
	pts: [number, number];
	overtimes: number;
	// Coach play-calling for [team 0, team 1] in this game
	coachPlayCalling: [boolean, boolean];
	snaps: Snap[];
};

// By what the play attempted -- a play wiped out by a penalty still counts as
// its attempted kind; "penalty" means nothing else happened (pre-snap fouls)
const classify = (types: Set<string>): SnapKind => {
	if (types.has("k") || types.has("onsideKick")) return "kickoff";
	if (types.has("p")) return "punt";
	if (types.has("fg")) return "fieldGoal";
	if (types.has("xp")) return "extraPoint";
	if (types.has("twoPointConversion")) return "twoPoint";
	if (types.has("kneel")) return "kneel";
	if (types.has("sk")) return "sack";
	if (types.has("int")) return "interception";
	if (types.has("pssCmp")) return "completion";
	if (types.has("pssInc")) return "incompletion";
	if (types.has("rus")) return "run";
	if (types.has("penalty")) return "penalty";
	return "other";
};

// Fresh players every game, so injuries and fatigue don't carry over
/** true/false for both teams, or [team 0, team 1] for head-to-head */
export type CoachSetting = boolean | [boolean, boolean];

const bothTeams = (coach: CoachSetting): [boolean, boolean] =>
	typeof coach === "boolean" ? [coach, coach] : [coach[0], coach[1]];

const newGame = async (gid: number, coach: [boolean, boolean]) => {
	const loaded = await loadTeams([0, 1], {});
	const teams = [loaded[0], loaded[1]];
	for (const t of teams) {
		if (t.depth !== undefined) {
			t.depth = team.getDepthPlayers(t.depth, t.player);
		}
	}

	const game = new GameSim({
		gid,
		teams: teams as any,
		baseInjuryRate: g.get("injuryRate"),
		doPlayByPlay: false,
		homeCourtFactor: 1,
		allStarGame: false,
		neutralSite: true,
	});
	game.coachPlayCalling = [coach[0], coach[1]];
	return game;
};

/**
 * Sim n games between tids 0 and 1 at a neutral site, recording every snap.
 * Players are loaded fresh each game, so injuries and fatigue don't carry over.
 */
export const simGames = async ({
	n,
	coach,
}: {
	n: number;
	coach: CoachSetting;
}) => {
	const records: GameRecord[] = [];

	for (let i = 0; i < n; i++) {
		// Head-to-head swaps sides every game so each roster gets the coach half
		// the time; a mirror match is unaffected
		const [a, b] = bothTeams(coach);
		const setting: [boolean, boolean] = i % 2 === 0 ? [a, b] : [b, a];
		const game = await newGame(i, setting);

		const snaps: Snap[] = [];
		const simPlay = game.simPlay.bind(game);
		game.simPlay = async () => {
			const quarter = game.team[0].stat.ptsQtrs.length;
			const clock = game.clock;
			const offense = game.o;

			const out = await simPlay();

			const types = new Set(
				game.currentPlay.events.map(({ event }) => event.type as string),
			);
			snaps.push({
				quarter,
				clock,
				offense,
				kind: classify(types),
				returned: types.has("kr") || types.has("pr"),
			});

			return out;
		};

		const result = await game.run();

		for (const [j, snap] of snaps.entries()) {
			const next = snaps[j + 1];
			if (next && next.quarter === snap.quarter) {
				snap.gap = (snap.clock - next.clock) * 60;
			}
		}

		records.push({
			pts: [result.team[0].stat.pts, result.team[1].stat.pts],
			overtimes: result.overtimes,
			coachPlayCalling: setting,
			snaps,
		});
	}

	return records;
};

const mean = (xs: number[]) =>
	xs.length === 0 ? NaN : xs.reduce((a, b) => a + b, 0) / xs.length;

const median = (xs: number[]) => {
	if (xs.length === 0) {
		return NaN;
	}
	const sorted = [...xs].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0
		? (sorted[mid - 1]! + sorted[mid]!) / 2
		: sorted[mid]!;
};

export type Summary = ReturnType<typeof summarize>;

export const summarize = (records: GameRecord[]) => {
	const snaps = records.flatMap((r) => r.snaps);
	const teamGames = records.length * 2;

	const offensive = snaps.filter((s) => OFFENSIVE_KINDS.has(s.kind));
	const passes = offensive.filter((s) => PASS_KINDS.has(s.kind)).length;
	const runs = offensive.filter((s) => s.kind === "run").length;

	const gaps = snaps.flatMap((s) => (s.gap === undefined ? [] : [s.gap]));
	const share = (pred: (gap: number) => boolean) =>
		gaps.filter(pred).length / gaps.length;

	const gapByKind: Partial<
		Record<SnapKind, { n: number; median: number; mean: number }>
	> = {};
	for (const s of snaps) {
		if (s.gap !== undefined) {
			gapByKind[s.kind] ??= { n: 0, median: 0, mean: 0 };
			gapByKind[s.kind]!.n += 1;
		}
	}
	for (const kind of Object.keys(gapByKind) as SnapKind[]) {
		const kindGaps = snaps.flatMap((s) =>
			s.kind === kind && s.gap !== undefined ? [s.gap] : [],
		);
		gapByKind[kind] = {
			n: kindGaps.length,
			median: median(kindGaps),
			mean: mean(kindGaps),
		};
	}

	// Per side, grouped by that team's own play-calling in each game
	type SideTotals = {
		teamGames: number;
		ptsFor: number;
		ptsAgainst: number;
		win: number;
		tie: number;
		loss: number;
		plays: number;
		passes: number;
		runs: number;
		attempts: number;
		ints: number;
	};
	const totals: Partial<Record<"coach" | "stock", SideTotals>> = {};
	for (const r of records) {
		for (const t of [0, 1] as const) {
			const other = t === 0 ? 1 : 0;
			const x = (totals[r.coachPlayCalling[t] ? "coach" : "stock"] ??= {
				teamGames: 0,
				ptsFor: 0,
				ptsAgainst: 0,
				win: 0,
				tie: 0,
				loss: 0,
				plays: 0,
				passes: 0,
				runs: 0,
				attempts: 0,
				ints: 0,
			});
			x.teamGames += 1;
			x.ptsFor += r.pts[t];
			x.ptsAgainst += r.pts[other];
			if (r.pts[t] > r.pts[other]) {
				x.win += 1;
			} else if (r.pts[t] < r.pts[other]) {
				x.loss += 1;
			} else {
				x.tie += 1;
			}

			for (const snap of r.snaps) {
				if (snap.offense !== t) {
					continue;
				}
				if (OFFENSIVE_KINDS.has(snap.kind)) {
					x.plays += 1;
				}
				if (PASS_KINDS.has(snap.kind)) {
					x.passes += 1;
				}
				if (snap.kind === "run") {
					x.runs += 1;
				}
				if (
					snap.kind === "completion" ||
					snap.kind === "incompletion" ||
					snap.kind === "interception"
				) {
					x.attempts += 1;
				}
				if (snap.kind === "interception") {
					x.ints += 1;
				}
			}
		}
	}

	const bySetting: Partial<
		Record<
			"coach" | "stock",
			{
				teamGames: number;
				ptsFor: number;
				ptsAgainst: number;
				win: number;
				tie: number;
				loss: number;
				offensivePlaysPerTeamGame: number;
				passRate: number;
				// Interceptions per pass attempt (sacks excluded)
				intRate: number;
			}
		>
	> = {};
	for (const key of ["coach", "stock"] as const) {
		const x = totals[key];
		if (x) {
			bySetting[key] = {
				teamGames: x.teamGames,
				ptsFor: x.ptsFor / x.teamGames,
				ptsAgainst: x.ptsAgainst / x.teamGames,
				win: x.win / x.teamGames,
				tie: x.tie / x.teamGames,
				loss: x.loss / x.teamGames,
				offensivePlaysPerTeamGame: x.plays / x.teamGames,
				passRate: x.passes / (x.passes + x.runs),
				intRate: x.ints / x.attempts,
			};
		}
	}
	return {
		games: records.length,
		ptsPerTeamGame:
			records.reduce((sum, r) => sum + r.pts[0] + r.pts[1], 0) / teamGames,
		offensivePlaysPerTeamGame: offensive.length / teamGames,
		passRate: passes / (passes + runs),
		returnsPerGame: snaps.filter((s) => s.returned).length / records.length,
		gapMedian: median(gaps),
		gapMean: mean(gaps),
		gapUnder10: share((gap) => gap < 10),
		gap10to40: share((gap) => gap >= 10 && gap < 40),
		gap40Plus: share((gap) => gap >= 40),
		gapByKind,
		bySetting,
	};
};

/** Side-by-side text table of named summaries, for console output. */
export const formatSummaries = (results: Record<string, Summary>) => {
	const names = Object.keys(results);
	const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
	const num = (x: number) => (Number.isNaN(x) ? "-" : x.toFixed(1));

	const rows: [string, (s: Summary) => string][] = [
		["games", (s) => String(s.games)],
		["pts / team-game", (s) => num(s.ptsPerTeamGame)],
		["offensive plays / team-game", (s) => num(s.offensivePlaysPerTeamGame)],
		["pass rate", (s) => pct(s.passRate)],
		["returns / game", (s) => num(s.returnsPerGame)],
		["gap median (s)", (s) => num(s.gapMedian)],
		["gap mean (s)", (s) => num(s.gapMean)],
		["gap < 10s", (s) => pct(s.gapUnder10)],
		["gap 10-40s", (s) => pct(s.gap10to40)],
		["gap 40s+", (s) => pct(s.gap40Plus)],
	];

	for (const key of ["coach", "stock"] as const) {
		if (!names.some((name) => results[name]!.bySetting[key])) {
			continue;
		}
		const side = (s: Summary) => s.bySetting[key];
		rows.push(
			[
				`${key} side: pts for / against`,
				(s) => {
					const x = side(s);
					return x ? `${num(x.ptsFor)} / ${num(x.ptsAgainst)}` : "-";
				},
			],
			[
				`${key} side: win / tie / loss`,
				(s) => {
					const x = side(s);
					return x ? `${pct(x.win)} / ${pct(x.tie)} / ${pct(x.loss)}` : "-";
				},
			],
			[
				`${key} side: pass rate / INT rate`,
				(s) => {
					const x = side(s);
					return x ? `${pct(x.passRate)} / ${pct(x.intRate)}` : "-";
				},
			],
		);
	}

	const kinds = [
		...new Set(names.flatMap((name) => Object.keys(results[name]!.gapByKind))),
	] as SnapKind[];
	for (const kind of kinds) {
		rows.push([
			`  ${kind}: n / median / mean`,
			(s) => {
				const k = s.gapByKind[kind];
				return k ? `${k.n} / ${num(k.median)} / ${num(k.mean)}` : "-";
			},
		]);
	}

	const width = Math.max(...rows.map(([label]) => label.length));
	const colWidth = 22;
	const lines = [
		`${"".padEnd(width)}  ${names.map((n) => n.padStart(colWidth)).join("")}`,
	];
	for (const [label, fmt] of rows) {
		lines.push(
			`${label.padEnd(width)}  ${names
				.map((n) => fmt(results[n]!).padStart(colWidth))
				.join("")}`,
		);
	}
	return lines.join("\n");
};

/**
 * A game situation from the offense's side. The offense is always tid 0.
 */
export type GameState = {
	down: number;
	toGo: number;
	// Yards from the offense's own goal line: the opponent's 20 is 80
	scrimmage: number;
	// Minutes left in the quarter: 0:09 is 0.15
	clock: number;
	quarter: number;
	// Offense score minus defense score
	diff: number;
	// [offense, defense]; defaults to the engine's starting timeouts
	timeouts?: [number, number];
};

export type StateResult = {
	n: number;
	// The sim's decision on the first snap, as getPlayType returned it
	calls: Record<string, number>;
	win: number;
	tie: number;
	loss: number;
	// Mean points each side scored from the snap to the end of the period
	ptsFor: number;
	ptsAgainst: number;
	// The state as the engine saw it on the first snap of the first trial
	firstSnap: GameState;
};

// Both teams start from here, the offense at BASE_PTS + diff
const BASE_PTS = 30;

const validateState = (state: GameState) => {
	const { down, toGo, scrimmage, clock, quarter, diff } = state;
	const fail = (msg: string) => {
		throw new Error(`simFromState: ${msg}`);
	};

	if (!Number.isInteger(down) || down < 1 || down > 4) {
		fail(`down must be 1-4, got ${down}`);
	}
	if (scrimmage < 1 || scrimmage > 99) {
		fail(`scrimmage must be 1-99, got ${scrimmage}`);
	}
	if (toGo < 1 || toGo > 100 - scrimmage) {
		fail(
			`toGo must be 1-${100 - scrimmage} from the ${scrimmage}, got ${toGo}`,
		);
	}
	if (clock <= 0 || clock > g.get("quarterLength")) {
		fail(
			`clock must be above 0 and at most ${g.get("quarterLength")}, got ${clock}`,
		);
	}
	if (
		!Number.isInteger(quarter) ||
		quarter < 1 ||
		quarter > g.get("numPeriods")
	) {
		fail(`quarter must be 1-${g.get("numPeriods")}, got ${quarter}`);
	}
	if (BASE_PTS + diff < 0) {
		fail(`diff must be at least -${BASE_PTS}, got ${diff}`);
	}
};

/**
 * Put the game in `state`, sim until the period ends, and repeat n times. In
 * the 4th quarter that's the end of regulation, so win/tie/loss is the real
 * result; a tie is left as a tie rather than played out in overtime. Earlier
 * quarters stop when that quarter's clock runs out.
 */
export const simFromState = async ({
	n,
	coach,
	state,
}: {
	n: number;
	// true/false for both teams, or [offense, defense]
	coach: CoachSetting;
	state: GameState;
}): Promise<StateResult> => {
	validateState(state);

	const calls: Record<string, number> = {};
	let win = 0;
	let tie = 0;
	let loss = 0;
	let ptsFor = 0;
	let ptsAgainst = 0;
	let firstSnap: GameState | undefined;

	for (let i = 0; i < n; i++) {
		const game = await newGame(i, bothTeams(coach));

		game.awaitingKickoff = undefined;
		game.awaitingAfterTouchdown = false;
		game.o = 0;
		game.d = 1;
		game.down = state.down;
		game.toGo = state.toGo;
		game.scrimmage = state.scrimmage;
		game.clock = state.clock;
		game.isClockRunning = false;

		const startPts = [BASE_PTS + state.diff, BASE_PTS] as const;
		for (const t of [0, 1] as const) {
			game.team[t].stat.pts = startPts[t];
			game.team[t].stat.ptsQtrs = [
				...Array<number>(state.quarter - 1).fill(0),
				startPts[t],
			];
		}
		if (state.timeouts) {
			game.timeouts = [...state.timeouts];
		}
		// Inside two minutes of a half, the warning has already been given
		game.twoMinuteWarningHappened =
			game.kickoffAfterEndOfPeriod(state.quarter) && state.clock <= 2;

		game.currentPlay = new Play(game);

		if (i === 0) {
			firstSnap = {
				down: game.down,
				toGo: game.toGo,
				scrimmage: game.scrimmage,
				clock: game.clock,
				quarter: game.team[0].stat.ptsQtrs.length,
				diff: game.team[0].stat.pts - game.team[1].stat.pts,
				timeouts: [...game.timeouts],
			};
		}

		let firstCall: string | undefined;
		const getPlayType = game.getPlayType.bind(game);
		game.getPlayType = async (...args) => {
			const playType = await getPlayType(...args);
			firstCall ??= playType;
			return playType;
		};

		// Same loop the engine uses to finish a period
		while (
			game.clock > 0 ||
			game.awaitingAfterTouchdown ||
			game.playUntimedPossession
		) {
			await game.simPlay();
		}

		calls[firstCall!] = (calls[firstCall!] ?? 0) + 1;

		const finalDiff = game.team[0].stat.pts - game.team[1].stat.pts;
		if (finalDiff > 0) {
			win += 1;
		} else if (finalDiff < 0) {
			loss += 1;
		} else {
			tie += 1;
		}
		ptsFor += game.team[0].stat.pts - startPts[0];
		ptsAgainst += game.team[1].stat.pts - startPts[1];
	}

	return {
		n,
		calls,
		win: win / n,
		tie: tie / n,
		loss: loss / n,
		ptsFor: ptsFor / n,
		ptsAgainst: ptsAgainst / n,
		firstSnap: firstSnap!,
	};
};

/** One row per named simFromState result, for console output. */
export const formatStateResults = (results: Record<string, StateResult>) => {
	const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
	const header = ["", "n", "win", "tie", "loss", "pts for", "first-snap call"];
	const rows = Object.entries(results).map(([label, r]) => [
		label,
		String(r.n),
		pct(r.win),
		pct(r.tie),
		pct(r.loss),
		r.ptsFor.toFixed(2),
		Object.entries(r.calls)
			.sort((a, b) => b[1] - a[1])
			.map(([call, count]) => `${call} ${pct(count / r.n)}`)
			.join(", "),
	]);

	const widths = header.map((h, i) =>
		Math.max(h.length, ...rows.map((row) => row[i]!.length)),
	);
	const fmt = (row: string[]) =>
		row
			.map((cell, i) =>
				i === 0 || i === row.length - 1
					? cell.padEnd(widths[i]!)
					: cell.padStart(widths[i]!),
			)
			.join("  ");

	return [fmt(header), ...rows.map(fmt)].join("\n");
};
