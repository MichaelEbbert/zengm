import { PLAYER } from "../../../common/constants.ts";
import { flushPlayers, readPlayersFilter } from "../../db/electronApi.ts";
import { idb } from "../../db/index.ts";
import { g, toUI } from "../../util/index.ts";
import { player } from "../index.ts";

const recomputeHallOfFame = async () => {
	const lid = g.get("lid");
	const cachePlayers = await idb.cache.players.getAll();
	const cacheByPid = new Map(cachePlayers.map((p) => [p.pid, p]));
	const allPlayers =
		(await readPlayersFilter(lid, { activeAndRetired: true })) ?? cachePlayers;

	const toFlush: any[] = [];
	for (const pRaw of allPlayers) {
		const p = cacheByPid.get(pRaw.pid) ?? pRaw;
		const made = p.tid === PLAYER.RETIRED && player.madeHof(p);
		const prev = p.hof;
		if (made) {
			p.hof = 1;
		} else {
			delete p.hof;
		}

		if (p.hof !== prev) {
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

	await idb.cache.fill();
	await toUI("realtimeUpdate", [["firstRun"]]);
};

export default recomputeHallOfFame;
