import { idb } from "../index.ts";
import type { GetCopyType } from "../../../common/types.ts";
import { mergeByPk } from "./helpers.ts";
import { readAwards as electronReadAwards } from "../electronApi.ts";
import { g } from "../../util/index.ts";

const getCopies = async (
	{
		season,
	}: {
		season?: number;
	} = {},
	type?: GetCopyType,
): Promise<any[]> => {
	let lid: number | undefined;
	try {
		lid = g.get("lid") as number;
	} catch {}

	if (season !== undefined) {
		return mergeByPk(
			typeof lid === "number"
				? (((await electronReadAwards(lid, { season })) as any[]) ?? [])
				: await idb.league.getAll("awards", season),
			(await idb.cache.awards.getAll()).filter((a) => a.season === season),
			"awards",
			type,
		);
	}

	return mergeByPk(
		typeof lid === "number"
			? (((await electronReadAwards(lid)) as any[]) ?? [])
			: await idb.league.getAll("awards"),
		await idb.cache.awards.getAll(),
		"awards",
		type,
	);
};

export default getCopies;
