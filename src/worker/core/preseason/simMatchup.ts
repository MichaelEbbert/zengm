import { GameSim, team } from "../index.ts";
import loadTeams from "../game/loadTeams.ts";
import { gameSimToBoxScore } from "../game/writeGameStats.ts";
import { boxScoreToLiveSim } from "../../views/liveGame.ts";
import { g, helpers, random, toUI } from "../../util/index.ts";
import { writePreseasonScore } from "../../db/electronApi.ts";
import { DEFAULT_STADIUM_CAPACITY } from "../../../common/constants.ts";
import type { Conditions } from "../../../common/types.ts";
import invertDepth from "./invertDepth.football.ts";
import getMatchups from "./getMatchups.ts";

/**
 * Sim one preseason matchup with both depth charts inverted, hand the live sim
 * to the UI, and store nothing but the final score.
 *
 * Deliberately does NOT go through simExhibitionGame. That fakes a league
 * context -- phase, userTid, userTids, all 72 EXHIBITION_GAME_SETTINGS keys,
 * season, numActiveTeams, and local.exhibitionGamePlayers -- which is right
 * when there is no league open and catastrophic when there is. Inside a real
 * league `g` is already correct, so we build the teams ourselves.
 *
 * Nothing here writes a game, a player stat, a team stat or a head-to-head
 * row. Injuries do occur during the sim and are announced in the play-by-play,
 * but processTeam hands GameSim a copy of each player, so they never reach the
 * database.
 */
const simMatchup = async (
	week: number,
	idx: number,
	conditions: Conditions,
) => {
	const season = g.get("season");

	const matchups = await getMatchups();
	const matchup = matchups.find((m) => m.week === week && m.idx === idx);
	if (!matchup) {
		throw new Error(`No preseason matchup for week ${week}, game ${idx}`);
	}

	if (matchup.homePts !== undefined) {
		throw new Error(
			`Preseason week ${week} game ${idx} has already been played`,
		);
	}

	const { homeTid, awayTid } = matchup;

	const loaded = await loadTeams([homeTid, awayTid], conditions);

	// Same order as a real game: teams[0] is home, teams[1] is away.
	const teams = [loaded[homeTid], loaded[awayTid]] as [any, any];
	for (const t of teams) {
		if (!t) {
			throw new Error("Could not load both teams for the preseason game");
		}
	}

	for (const t of teams) {
		if (t.depth === undefined) {
			continue;
		}

		const posByPid = new Map<number, string>();
		for (const p of t.player) {
			posByPid.set(p.pid ?? p.id, p.pos);
		}

		// Invert first, then convert pids to player objects -- getDepthPlayers
		// needs referential integrity with t.player, so it has to run last.
		t.depth = team.getDepthPlayers(invertDepth(t.depth, posByPid), t.player);
	}

	// No game row is ever written, so there is no real gid. Randomize it so the
	// UI does not reuse cached players from a previous preseason game.
	const gid = random.randInt(0, 1000000000);

	const result = await new GameSim({
		gid,
		day: -1,
		teams,
		doPlayByPlay: true,
		homeCourtFactor: 1,
		neutralSite: false,
		allStarGame: false,
		baseInjuryRate: g.get("injuryRate"),

		// Meaningless in football; the GameSim constructor type spans all sports.
		dh: false,
	}).run();

	const { gameStats: boxScore } = await gameSimToBoxScore(
		result,
		DEFAULT_STADIUM_CAPACITY,
	);

	const homePts = result.team[0].stat.pts;
	const awayPts = result.team[1].stat.pts;

	await writePreseasonScore(g.get("lid"), season, week, idx, homePts, awayPts);

	const liveSim = await boxScoreToLiveSim({
		allStars: undefined,
		confetti: false,
		boxScore,
		playByPlay: result.playByPlay as any,
	});

	await toUI(
		"realtimeUpdate",
		[[], helpers.leagueUrl(["preseason_games", "game"]), { liveSim }],
		conditions,
	);
};

export default simMatchup;
