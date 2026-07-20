import { readAllPlayoffSeries } from "../electronApi.ts";
import { idb } from "../index.ts";
import { g } from "../../util/index.ts";
import type { GetCopyType, PlayoffSeries } from "../../../common/types.ts";
import { maybeDeepCopy } from "../getCopies/helpers.ts";

const getCopy = async (
	{
		season,
	}: {
		season: number;
	},
	type?: GetCopyType,
): Promise<PlayoffSeries | undefined> => {
	if (season === g.get("season")) {
		return maybeDeepCopy(await idb.cache.playoffSeries.get(season), type);
	}

	const lid = g.get("lid");
	const all = (await readAllPlayoffSeries(lid)) ?? [];
	return all.find((ps: any) => ps.season === season);
};

export default getCopy;
