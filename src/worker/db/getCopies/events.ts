import { idb } from "../index.ts";
import { maybeDeepCopy, mergeByPk } from "./helpers.ts";
import type { EventBBGM, GetCopyType } from "../../../common/types.ts";
import { readEvents as electronReadEvents } from "../electronApi.ts";
import { g } from "../../util/index.ts";

type Filter = (event: EventBBGM) => boolean;

const getCopies = async (
	input:
		| {
				filter?: Filter;
		  }
		| {
				eid: number;
				filter?: Filter;
		  }
		| {
				dpid: number;
				filter?: Filter;
		  }
		| {
				pid: number;
				filter?: Filter;
		  }
		| {
				season: number;
				filter?: Filter;
		  } = {},
	type?: GetCopyType,
): Promise<EventBBGM[]> => {
	const {
		eid,
		dpid,
		pid,
		season,
		filter = () => true,
	} = input as {
		eid?: number;
		dpid?: number;
		pid?: number;
		season?: number;
		filter?: Filter;
	};

	let lid: number | undefined;
	try {
		lid = g.get("lid") as number;
	} catch {}

	if (season !== undefined) {
		return mergeByPk(
			typeof lid === "number"
				? (((await electronReadEvents(lid, { season })) as EventBBGM[]) ?? [])
				: [],
			(await idb.cache.events.getAll()).filter((ev) => ev.season === season),
			"events",
			type,
		).filter(filter);
	}

	if (pid !== undefined) {
		return mergeByPk(
			typeof lid === "number"
				? (((await electronReadEvents(lid, { pid })) as EventBBGM[]) ?? [])
				: [],
			(await idb.cache.events.getAll()).filter(
				(ev) => ev.pids !== undefined && ev.pids.includes(pid),
			),
			"events",
			type,
		).filter(filter);
	}

	if (dpid !== undefined) {
		return mergeByPk(
			typeof lid === "number"
				? (((await electronReadEvents(lid, { dpid })) as EventBBGM[]) ?? [])
				: [],
			(await idb.cache.events.getAll()).filter(
				(ev) => ev.dpids !== undefined && ev.dpids.includes(dpid),
			),
			"events",
			type,
		).filter(filter);
	}

	if (eid !== undefined) {
		const cached = await idb.cache.events.get(eid);
		if (cached) return [maybeDeepCopy(cached, type)];

		if (typeof lid === "number") {
			const sqliteEvs = await electronReadEvents(lid, { eid });
			if (sqliteEvs && sqliteEvs.length > 0) return sqliteEvs as EventBBGM[];
		}

		return [];
	}

	return mergeByPk(
		typeof lid === "number"
			? (((await electronReadEvents(lid)) as EventBBGM[]) ?? [])
			: [],
		await idb.cache.events.getAll(),
		"events",
		type,
	).filter(filter);
};

export default getCopies;
