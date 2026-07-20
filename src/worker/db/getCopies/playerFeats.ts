import { idb } from "../index.ts";
import { mergeByPk } from "./helpers.ts";
import type { GetCopyType, PlayerFeat } from "../../../common/types.ts";
import { readAllPlayerFeats as electronReadAllPlayerFeats } from "../electronApi.ts";
import { g } from "../../util/index.ts";

const getCopies = async (
	options: any = {},
	type?: GetCopyType,
): Promise<PlayerFeat[]> => {
	let lid: number | undefined;
	try {
		lid = g.get("lid") as number;
	} catch {}

	return mergeByPk(
		typeof lid === "number"
			? (((await electronReadAllPlayerFeats(lid)) as PlayerFeat[]) ?? [])
			: [],
		await idb.cache.playerFeats.getAll(),
		"playerFeats",
		type,
	);
};

export default getCopies;
