import type { UpdateEvents } from "../../common/types.ts";
import { getGlobalSettings } from "../util/index.ts";

const updateOptions = async (inputs: unknown, updateEvents: UpdateEvents) => {
	if (updateEvents.includes("firstRun") || updateEvents.includes("options")) {
		const options = await getGlobalSettings();

		// realPlayerPhotos and realTeamInfo not used in this fork
		return {
			realPlayerPhotos: "",
			realTeamInfo: "",
			units: options.units,
			fullNames: !!options.fullNames,
			phaseChangeRedirects: options.phaseChangeRedirects,
		};
	}
};

export default updateOptions;
