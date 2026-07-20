import { metaGetAttribute } from "../db/electronApi.ts";
import type { Options } from "../../common/types.ts";
import { DEFAULT_PHASE_CHANGE_REDIRECTS } from "../../common/constants.ts";

const getGlobalSettings = async () => {
	const globalSettings = ((await metaGetAttribute("options")) ??
		{}) as unknown as Options;

	globalSettings.phaseChangeRedirects ??= DEFAULT_PHASE_CHANGE_REDIRECTS;

	return globalSettings;
};

export default getGlobalSettings;
