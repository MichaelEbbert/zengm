import { idb } from "../index.ts";
import { maybeDeepCopy, mergeByPk } from "./helpers.ts";
import { g } from "../../util/index.ts";
import type { GetCopyType, TeamSeason } from "../../../common/types.ts";
import { NUM_PRIOR_SEASONS_TEAM_SEASONS } from "../Cache.ts";
import { readTeamSeasons as electronReadTeamSeasons } from "../electronApi.ts";

const getCopies = async (
	{
		tid,
		season,
		seasons,
		note,
	}: {
		tid?: number;
		season?: number;
		seasons?: Readonly<[number, number]>;
		note?: boolean;
	} = {},
	type?: GetCopyType,
): Promise<TeamSeason[]> => {
	let lid: number | undefined;
	try {
		lid = g.get("lid") as number;
	} catch {}

	if (note) {
		const sqliteRows =
			typeof lid === "number"
				? ((await electronReadTeamSeasons(lid, { note: true })) ?? [])
				: [];
		return mergeByPk(
			sqliteRows,
			await idb.cache.teamSeasons.getAll(),
			"teamSeasons",
			type,
		).filter((row) => row.noteBool === 1);
	}

	if (tid !== undefined && season !== undefined) {
		// Return array of length 1
		let teamSeason;
		if (season >= g.get("season") - NUM_PRIOR_SEASONS_TEAM_SEASONS) {
			teamSeason = maybeDeepCopy(
				await idb.cache.teamSeasons.indexGet("teamSeasonsBySeasonTid", [
					season,
					tid,
				]),
				type,
			);
		} else {
			const rows =
				typeof lid === "number"
					? ((await electronReadTeamSeasons(lid, { tid, season })) ?? [])
					: [];
			teamSeason = rows[0];
		}

		if (teamSeason) {
			return [teamSeason];
		}
		return [];
	}

	if (tid === undefined) {
		if (season !== undefined) {
			if (season >= g.get("season") - NUM_PRIOR_SEASONS_TEAM_SEASONS) {
				// Single season, from cache
				return maybeDeepCopy(
					await idb.cache.teamSeasons.indexGetAll("teamSeasonsBySeasonTid", [
						[season],
						[season, "Z"],
					]),
					type,
				);
			}

			// Single season, from SQLite
			return (
				(typeof lid === "number"
					? await electronReadTeamSeasons(lid, { season })
					: null) ?? []
			);
		}

		throw new Error(
			"idb.getCopies.teamSeasons requires season if tid is undefined",
		);
	}

	if (seasons !== undefined) {
		const sqliteRows =
			typeof lid === "number"
				? ((await electronReadTeamSeasons(lid, {
						tid,
						seasonFrom: seasons[0],
						seasonTo: seasons[1],
					})) ?? [])
				: [];
		return mergeByPk(
			sqliteRows,
			await idb.cache.teamSeasons.indexGetAll("teamSeasonsByTidSeason", [
				[tid, seasons[0]],
				[tid, seasons[1]],
			]),
			"teamSeasons",
			type,
		);
	}

	const sqliteRows =
		typeof lid === "number"
			? ((await electronReadTeamSeasons(lid, { tid })) ?? [])
			: [];
	return mergeByPk(
		sqliteRows,
		await idb.cache.teamSeasons.indexGetAll("teamSeasonsByTidSeason", [
			[tid],
			[tid, "Z"],
		]),
		"teamSeasons",
		type,
	);
};

export default getCopies;
