import { DEFAULT_JERSEY, DEFAULT_TEAM_COLORS } from "../../common/constants.ts";
import { idb } from "../db/index.ts";
import { g } from "../util/index.ts";
import { readTeamSeasons as electronReadTeamSeasons } from "../db/electronApi.ts";

const getTeamInfoBySeason = async (tid: number, season: number) => {
	if (tid === -1 || tid === -2) {
		return {
			abbrev: "ASG",
			colors: DEFAULT_TEAM_COLORS,
			jersey: DEFAULT_JERSEY,
			name: tid === -1 ? "1" : "2",
			region: "All-Stars",
		};
	}

	let lid: number | undefined;
	try {
		lid = g.get("lid") as number;
	} catch {}

	let ts:
		| {
				abbrev: string;
				colors: [string, string, string];
				jersey?: string;
				name: string;
				region: string;
		  }
		| undefined;

	if (typeof lid === "number") {
		const rows = (await electronReadTeamSeasons(lid, { tid, season })) ?? [];
		if (rows[0]) {
			ts = rows[0];
		} else {
			// No exact match — find closest season for this team
			const allRows = (await electronReadTeamSeasons(lid, { tid })) ?? [];
			if (allRows.length > 0) {
				// Find the latest season that doesn't exceed requested season
				let best: any = allRows[0];
				for (const row of allRows) {
					if (row.season <= season) {
						best = row;
					} else if (!best || row.season < best.season) {
						best = row;
					}
				}
				ts = best;
			}
		}
	} else {
		// Browser fallback: use cache only
		ts = await idb.cache.teams.get(tid);
	}

	if (ts) {
		return {
			abbrev: ts.abbrev,
			colors: ts.colors ?? DEFAULT_TEAM_COLORS,
			jersey: ts.jersey,
			name: ts.name,
			region: ts.region,
		};
	}

	// Could be an invalid tid, like PLAYER.TOT or PLAYER.DOES_NOT_EXIST
};

export default getTeamInfoBySeason;
