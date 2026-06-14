import { idb } from "../index.ts";
import type { GetCopyType, HeadToHead } from "../../../common/types.ts";
import { mergeByPk } from "./helpers.ts";
import { readHeadToHeads as electronReadHeadToHeads } from "../electronApi.ts";
import { g } from "../../util/index.ts";

const getCopies = async (
	{
		season,
	}: {
		season?: number;
	} = {},
	type?: GetCopyType,
): Promise<HeadToHead[]> => {
	let lid: number | undefined;
	try {
		lid = g.get("lid") as number;
	} catch {}

	if (season !== undefined) {
		return mergeByPk(
			typeof lid === "number"
				? (((await electronReadHeadToHeads(lid, {
						season,
					})) as HeadToHead[]) ?? [])
				: await idb.league.getAll("headToHeads", season),
			(await idb.cache.headToHeads.getAll()).filter((r) => r.season === season),
			"headToHeads",
			type,
		);
	}

	return mergeByPk(
		typeof lid === "number"
			? (((await electronReadHeadToHeads(lid)) as HeadToHead[]) ?? [])
			: await idb.league.getAll("headToHeads"),
		await idb.cache.headToHeads.getAll(),
		"headToHeads",
		type,
	);
};

export default getCopies;
