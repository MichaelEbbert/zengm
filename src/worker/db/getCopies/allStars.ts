import { idb } from "../index.ts";
import { mergeByPk } from "./helpers.ts";
import type { AllStars, GetCopyType } from "../../../common/types.ts";
import { readAllStars as electronReadAllStars } from "../electronApi.ts";
import { g } from "../../util/index.ts";

const getCopies = async (
	{
		season,
	}: {
		season?: number;
	} = {},
	type?: GetCopyType,
): Promise<AllStars[]> => {
	let lid: number | undefined;
	try {
		lid = g.get("lid") as number;
	} catch {}

	if (season !== undefined) {
		return mergeByPk(
			typeof lid === "number"
				? (((await electronReadAllStars(lid, { season })) as AllStars[]) ?? [])
				: [],
			(await idb.cache.allStars.getAll()).filter((r) => r.season === season),
			"allStars",
			type,
		);
	}

	return mergeByPk(
		typeof lid === "number"
			? (((await electronReadAllStars(lid)) as AllStars[]) ?? [])
			: [],
		await idb.cache.allStars.getAll(),
		"allStars",
		type,
	);
};

export default getCopies;
