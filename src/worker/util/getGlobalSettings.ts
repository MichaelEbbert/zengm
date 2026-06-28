import { metaGetAttribute } from "../db/electronApi.ts";
import { idb } from "../db/index.ts";
import type { Options } from "../../common/types.ts";
import { DEFAULT_PHASE_CHANGE_REDIRECTS } from "../../common/constants.ts";

const getGlobalSettings = async () => {
	const globalSettings = ((await metaGetAttribute("options")) ??
		(await idb.meta.get("attributes", "options")) ??
		{}) as unknown as Options;

	globalSettings.phaseChangeRedirects ??= DEFAULT_PHASE_CHANGE_REDIRECTS;

	return globalSettings;
};

export default getGlobalSettings;
