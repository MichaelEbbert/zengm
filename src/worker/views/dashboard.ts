import { metaGetAllLeagues } from "../db/electronApi.ts";
import { idb } from "../db/index.ts";
import type { UpdateEvents } from "../../common/types.ts";

const updateDashboard = async (inputs: unknown, updateEvents: UpdateEvents) => {
	if (updateEvents.includes("firstRun") || updateEvents.includes("leagues")) {
		const leagues =
			(await metaGetAllLeagues()) ?? (await idb.meta.getAll("leagues"));

		for (const league of leagues) {
			league.teamRegion ??= "???";
			league.teamName ??= "???";
		}

		return {
			leagues,
		};
	}
};

export default updateDashboard;
