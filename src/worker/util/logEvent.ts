import { createLogger } from "../../common/createLogger.ts";
import { PHASE } from "../../common/constants.ts";
import { idb } from "../db/index.ts";
import g from "./g.ts";
import toUI from "./toUI.ts";
import type {
	Conditions,
	LogEventSaveOptions,
	LogEventShowOptions,
} from "../../common/types.ts";

// Week of the next unplayed game, so a move between games is dated to the week it affects
const getWeek = async () => {
	if (g.get("phase") !== PHASE.REGULAR_SEASON) {
		return;
	}

	let week: number | undefined;
	for (const game of await idb.cache.schedule.getAll()) {
		if (week === undefined || game.day < week) {
			week = game.day;
		}
	}
	return week;
};

const saveEvent = async (event: LogEventSaveOptions) => {
	return idb.cache.events.add({
		...event,
		season: g.get("season"),
		phase: g.get("phase"),
		week: await getWeek(),
	});
};

// conditions only needed when showNotification is true, otherwise this is never called
const logEvent = createLogger(
	saveEvent,
	(options: LogEventShowOptions, conditions?: Conditions) => {
		toUI("showEvent", [options], conditions);
	},
);

export default logEvent;
