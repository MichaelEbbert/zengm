import { DEFAULT_CONFS } from "../../common/constants.ts";
import type { UpdateEvents } from "../../common/types.ts";
import { metaGetAttribute } from "../db/electronApi.ts";
import goatFormula from "../util/goatFormula.ts";
import { getDefaultSettings } from "./newLeague.ts";
import type { Settings } from "./settings.ts";

const updateOptions = async (inputs: unknown, updateEvents: UpdateEvents) => {
	if (updateEvents.includes("firstRun")) {
		const overrides = (await metaGetAttribute("defaultSettingsOverrides")) as
			| Partial<Settings>
			| undefined;

		const defaultSettings = {
			...getDefaultSettings(),
			numActiveTeams: undefined,
			goatFormula: goatFormula.DEFAULT_FORMULA,
			goatFormulaSeason: goatFormula.DEFAULT_FORMULA_SEASON,
			confs: DEFAULT_CONFS,
		};

		return {
			defaultSettings,
			overrides,
		};
	}
};

export default updateOptions;
