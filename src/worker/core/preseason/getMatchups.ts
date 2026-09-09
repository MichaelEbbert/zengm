import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";
import {
	readPreseasonMatchups,
	writePreseasonMatchups,
	type PreseasonMatchupRow,
} from "../../db/electronApi.ts";
import genMatchups from "./genMatchups.football.ts";

/**
 * Last season's two finalists, or undefined for either when we can't be sure.
 *
 * The champion won every playoff round; the runner-up won all but the last,
 * which is unique -- everyone else eliminated in the semifinals won two fewer.
 * Returns undefineds rather than throwing for a brand new league, a season
 * whose playoffs were never played, or a finalist that has since been
 * contracted; genMatchups then falls back to a random pair.
 */
const getFinalists = async (season: number) => {
	if (season <= g.get("startingSeason")) {
		return {};
	}

	const lastSeason = season - 1;

	let teams;
	try {
		teams = await idb.getCopies.teamsPlus(
			{
				attrs: ["tid", "disabled"],
				seasonAttrs: ["playoffRoundsWon"],
				season: lastSeason,
			},
			"noCopyCache",
		);
	} catch {
		return {};
	}

	if (!teams || teams.length === 0) {
		return {};
	}

	const numRounds = g.get("numGamesPlayoffSeries", lastSeason).length;

	const find = (roundsWon: number) =>
		teams.find(
			(t: any) => !t.disabled && t.seasonAttrs?.playoffRoundsWon === roundsWon,
		)?.tid;

	return {
		champTid: find(numRounds),
		runnerUpTid: find(numRounds - 1),
	};
};

/**
 * The three preseason matchups for the current season, generating and storing
 * them on first call and returning the stored rows (scores included) after.
 */
const getMatchups = async (): Promise<PreseasonMatchupRow[]> => {
	const lid = g.get("lid");
	const season = g.get("season");

	const existing = await readPreseasonMatchups(lid, season);
	if (existing && existing.length > 0) {
		return existing;
	}

	const allTeams = await idb.cache.teams.getAll();
	const tids = allTeams.filter((t) => !t.disabled).map((t) => t.tid);

	const { champTid, runnerUpTid } = await getFinalists(season);

	const rows: PreseasonMatchupRow[] = genMatchups({
		tids,
		champTid,
		runnerUpTid,
	}).map((m) => ({
		season,
		week: m.week,
		homeTid: m.homeTid,
		awayTid: m.awayTid,
	}));

	await writePreseasonMatchups(lid, rows);

	return rows;
};

export default getMatchups;
