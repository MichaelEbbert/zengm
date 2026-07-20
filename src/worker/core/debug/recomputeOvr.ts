import { last } from "../../../common/utils.ts";
import { flushPlayers, readPlayersFilter } from "../../db/electronApi.ts";
import { idb } from "../../db/index.ts";
import { g, toUI } from "../../util/index.ts";
import { player } from "../index.ts";

const recomputeOvr = async () => {
	const ovrs: {
		pid: number;
		old: number;
		new: number;
		diff: number;
	}[] = [];

	const lid = g.get("lid");
	const cachePlayers = await idb.cache.players.getAll();
	const cacheByPid = new Map(cachePlayers.map((p) => [p.pid, p]));
	const allPlayers =
		(await readPlayersFilter(lid, { activeAndRetired: true })) ?? cachePlayers;

	const toFlush: any[] = [];
	for (const pRaw of allPlayers) {
		const p = cacheByPid.get(pRaw.pid) ?? pRaw;
		const ratings = last(p.ratings);
		const ovr = player.ovr(ratings);
		ovrs.push({
			pid: p.pid,
			old: ratings.ovr,
			new: ovr,
			diff: ovr - ratings.ovr,
		});

		if (ratings.ovr !== ovr) {
			ratings.ovr = ovr;
			if (cacheByPid.has(p.pid)) {
				await idb.cache.players.put(p);
			} else {
				toFlush.push(p);
			}
		}
	}

	if (toFlush.length > 0) {
		await flushPlayers(lid, toFlush);
	}

	console.table(ovrs);
	await idb.cache.fill();
	await toUI("realtimeUpdate", [["firstRun"]]);
};

export default recomputeOvr;
