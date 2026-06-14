import { idb } from "../index.ts";
import { mergeByPk } from "./helpers.ts";
import type { GetCopyType, PlayoffSeries } from "../../../common/types.ts";
import { readAllPlayoffSeries as electronReadAllPlayoffSeries } from "../electronApi.ts";
import { g } from "../../util/index.ts";

const getCopies = async (
	options: unknown,
	type?: GetCopyType,
): Promise<PlayoffSeries[]> => {
	let lid: number | undefined;
	try {
		lid = g.get("lid") as number;
	} catch {}

	return mergeByPk(
		typeof lid === "number"
			? (((await electronReadAllPlayoffSeries(lid)) as PlayoffSeries[]) ?? [])
			: await idb.league.getAll("playoffSeries"),
		await idb.cache.playoffSeries.getAll(),
		"playoffSeries",
		type,
	);
};

export default getCopies;
