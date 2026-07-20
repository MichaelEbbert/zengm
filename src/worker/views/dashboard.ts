import { metaGetAllLeagues } from "../db/electronApi.ts";
import type { UpdateEvents } from "../../common/types.ts";

const updateDashboard = async (inputs: unknown, updateEvents: UpdateEvents) => {
	if (updateEvents.includes("firstRun") || updateEvents.includes("leagues")) {
		const leagues = (await metaGetAllLeagues()) ?? [];

		for (const league of leagues) {
			league.teamRegion ??= "???";
			league.teamName ??= "???";
			if (league.created && !(league.created instanceof Date)) {
				league.created = new Date(league.created);
			}
			if (league.lastPlayed && !(league.lastPlayed instanceof Date)) {
				league.lastPlayed = new Date(league.lastPlayed);
			}
		}

		return {
			leagues,
		};
	}
};

export default updateDashboard;
