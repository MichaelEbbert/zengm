import { idb } from "../index.ts";
import { mergeByPk } from "./helpers.ts";
import type { DraftLotteryResult, GetCopyType } from "../../../common/types.ts";
import { readDraftLotteryResults as electronReadDraftLotteryResults } from "../electronApi.ts";
import { g } from "../../util/index.ts";

const getCopies = async (
	{
		season,
	}: {
		season?: number;
	} = {},
	type?: GetCopyType,
): Promise<DraftLotteryResult[]> => {
	let lid: number | undefined;
	try {
		lid = g.get("lid") as number;
	} catch {}

	if (season !== undefined) {
		return mergeByPk(
			typeof lid === "number"
				? (((await electronReadDraftLotteryResults(lid, {
						season,
					})) as DraftLotteryResult[]) ?? [])
				: await idb.league.getAll("draftLotteryResults", season),
			(await idb.cache.draftLotteryResults.getAll()).filter(
				(r) => r.season === season,
			),
			"draftLotteryResults",
			type,
		);
	}

	return mergeByPk(
		typeof lid === "number"
			? (((await electronReadDraftLotteryResults(
					lid,
				)) as DraftLotteryResult[]) ?? [])
			: await idb.league.getAll("draftLotteryResults"),
		await idb.cache.draftLotteryResults.getAll(),
		"draftLotteryResults",
		type,
	);
};

export default getCopies;
