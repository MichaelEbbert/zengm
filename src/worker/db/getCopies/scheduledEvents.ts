import { idb } from "../index.ts";
import { mergeByPk } from "./helpers.ts";
import type { GetCopyType, ScheduledEvent } from "../../../common/types.ts";
import { readScheduledEvents as electronReadScheduledEvents } from "../electronApi.ts";
import { g } from "../../util/index.ts";

const getCopies = async (
	options: unknown,
	type?: GetCopyType,
): Promise<ScheduledEvent[]> => {
	let lid: number | undefined;
	try {
		lid = g.get("lid") as number;
	} catch {}

	return mergeByPk(
		typeof lid === "number"
			? (((await electronReadScheduledEvents(lid)) as ScheduledEvent[]) ?? [])
			: [],
		await idb.cache.scheduledEvents.getAll(),
		"scheduledEvents",
		type,
	);
};

export default getCopies;
