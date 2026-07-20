import { flushPlayers, readPlayersFilter } from "../../db/electronApi.ts";
import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";
import { PLAYER } from "../../../common/constants.ts";
import type { Player } from "../../../common/types.ts";

const hasRelativeAndMutate = (p: Player, pids: number[]) => {
	if (!p.relatives) {
		return false;
	}

	const has = p.relatives.some((relative) => pids.includes(relative.pid));
	if (has) {
		p.relatives = p.relatives.filter(
			(relative) => !pids.includes(relative.pid),
		);
	}
	return has;
};

const remove = async (pids: number[]) => {
	if (pids.length === 0) {
		return;
	}

	for (const pid of pids) {
		await idb.cache.players.delete(pid);
	}

	// Also remove any relatives from cache (active players)
	const players = await idb.cache.players.getAll();
	for (const p of players) {
		if (pids.includes(p.pid)) {
			continue;
		}

		if (hasRelativeAndMutate(p, pids)) {
			await idb.cache.players.put(p);
		}
	}

	// Also remove any relatives from retired players in SQLite
	const lid = g.get("lid");
	const retiredPlayers =
		(await readPlayersFilter(lid, { activeAndRetired: true }))?.filter(
			(p: any) => p.tid === PLAYER.RETIRED,
		) ?? [];

	const toFlush: any[] = [];
	for (const p of retiredPlayers) {
		if (pids.includes(p.pid)) {
			continue;
		}

		if (hasRelativeAndMutate(p, pids)) {
			toFlush.push(p);
		}
	}

	if (toFlush.length > 0) {
		await flushPlayers(lid, toFlush);
	}
};

export default remove;
