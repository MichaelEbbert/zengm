import { PLAYER } from "../../../common/constants.ts";
import { idb } from "../index.ts";
import { mergeByPk } from "./helpers.ts";
import { g, helpers } from "../../util/index.ts";
import type { GetCopyType, Player } from "../../../common/types.ts";
import { readPlayersFilter } from "../electronApi.ts";

function getLid(): number | undefined {
	try {
		return g.get("lid") as number;
	} catch {
		return undefined;
	}
}

const getCopies = async (
	{
		pid,
		pids,
		retiredYear,
		activeAndRetired,
		activeSeason,
		draftYear,
		hof,
		note,
		statsTid,
		tid,
		watch,
		filter = () => true,
	}: {
		pid?: number;
		pids?: number[];
		retiredYear?: number;
		activeAndRetired?: boolean;
		activeSeason?: number;
		draftYear?: number;
		hof?: boolean;
		note?: boolean;
		statsTid?: number;
		tid?: [number, number] | number;
		watch?: boolean;
		filter?: (p: Player) => boolean;
	} = {},
	type?: GetCopyType,
): Promise<Player[]> => {
	if (pids?.length === 1) {
		pid = pids[0];
	}

	if (pid !== undefined) {
		const p = await idb.cache.players.get(pid);
		if (p) {
			return [type === "noCopyCache" ? p : helpers.deepCopy(p)];
		}

		const lid = getLid();
		if (lid !== undefined) {
			const sqlitePlayers = await readPlayersFilter(lid, { pid });
			if (sqlitePlayers !== null && sqlitePlayers.length > 0) {
				return sqlitePlayers;
			}
		}

		return [];
	}

	if (pids !== undefined) {
		if (pids.length === 0) {
			return [];
		}

		const lid = getLid();
		if (lid !== undefined) {
			const sqlitePlayers = await readPlayersFilter(lid, { pids });
			if (sqlitePlayers !== null) {
				const merged = mergeByPk(
					sqlitePlayers,
					(await idb.cache.players.getAll()).filter((p) =>
						pids.includes(p.pid),
					),
					"players",
					type,
				);
				const sorted = [];
				for (const p of pids) {
					const found = merged.find((p2) => p2.pid === p);
					if (found) sorted.push(found);
				}
				return sorted;
			}
		}

		const merged = mergeByPk(
			[],
			(await idb.cache.players.getAll()).filter((p) => pids.includes(p.pid)),
			"players",
			type,
		);
		const sorted = [];
		for (const p of pids) {
			const found = merged.find((p2) => p2.pid === p);
			if (found) sorted.push(found);
		}
		return sorted;
	}

	if (retiredYear !== undefined) {
		const lid = getLid();
		if (lid !== undefined) {
			const sqlitePlayers = await readPlayersFilter(lid, { retiredYear });
			if (sqlitePlayers !== null) {
				return sqlitePlayers.filter(filter);
			}
		}

		return mergeByPk(
			[],
			await idb.cache.players.indexGetAll("playersByTid", PLAYER.RETIRED),
			"players",
			type,
		).filter((p) => p.retiredYear === retiredYear);
	}

	if (tid !== undefined) {
		if (Array.isArray(tid)) {
			const [minTid, maxTid] = tid;

			if (
				minTid === PLAYER.RETIRED ||
				maxTid === PLAYER.RETIRED ||
				(minTid < PLAYER.RETIRED && maxTid > PLAYER.RETIRED)
			) {
				throw new Error("Not implemented");
			}
		}

		const fromDB = (
			await idb.cache.players.indexGetAll("playersByTid", tid)
		).filter(filter);
		return type === "noCopyCache" ? fromDB : helpers.deepCopy(fromDB);
	}

	if (activeAndRetired === true) {
		const lid = getLid();
		if (lid !== undefined) {
			const sqlitePlayers = await readPlayersFilter(lid, {
				activeAndRetired: true,
			});
			if (sqlitePlayers !== null) {
				return mergeByPk(
					sqlitePlayers,
					([] as Player[]).concat(
						await idb.cache.players.indexGetAll("playersByTid", PLAYER.RETIRED),
						await idb.cache.players.indexGetAll("playersByTid", [
							PLAYER.FREE_AGENT,
							Infinity,
						]),
					),
					"players",
					type,
				).filter(filter);
			}
		}

		return mergeByPk(
			[],
			([] as Player[]).concat(
				await idb.cache.players.indexGetAll("playersByTid", PLAYER.RETIRED),
				await idb.cache.players.indexGetAll("playersByTid", [
					PLAYER.FREE_AGENT,
					Infinity,
				]),
			),
			"players",
			type,
		).filter(filter);
	}

	if (activeSeason !== undefined) {
		let proceed = true;
		if (statsTid !== undefined) {
			const numTeams = g.get("numTeams");
			const numSeasons = g.get("season") - g.get("startingSeason");

			if (5 * numTeams > numSeasons) {
				proceed = false;
			}
		}

		if (proceed) {
			const lid = getLid();
			if (lid !== undefined) {
				const sqlitePlayers = await readPlayersFilter(lid, { activeSeason });
				if (sqlitePlayers !== null) {
					return mergeByPk(
						sqlitePlayers,
						([] as Player[])
							.concat(
								await idb.cache.players.indexGetAll(
									"playersByTid",
									PLAYER.RETIRED,
								),
								await idb.cache.players.indexGetAll("playersByTid", [
									PLAYER.FREE_AGENT,
									Infinity,
								]),
							)
							.filter(
								(p) =>
									p.draft.year < activeSeason &&
									p.retiredYear >= activeSeason &&
									(statsTid === undefined || p.statsTids?.includes(statsTid)),
							),
						"players",
						type,
					);
				}
			}

			return mergeByPk(
				[],
				([] as Player[])
					.concat(
						await idb.cache.players.indexGetAll("playersByTid", PLAYER.RETIRED),
						await idb.cache.players.indexGetAll("playersByTid", [
							PLAYER.FREE_AGENT,
							Infinity,
						]),
					)
					.filter(
						(p) =>
							p.draft.year < activeSeason &&
							p.retiredYear >= activeSeason &&
							(statsTid === undefined || p.statsTids?.includes(statsTid)),
					),
				"players",
				type,
			);
		}
	}

	if (hof) {
		const lid = getLid();
		if (lid !== undefined) {
			const sqlitePlayers = await readPlayersFilter(lid, { hof: true });
			if (sqlitePlayers !== null) {
				return mergeByPk(
					sqlitePlayers,
					(await idb.cache.players.getAll()).filter((p) => p.hof === 1),
					"players",
					type,
				).filter(filter);
			}
		}

		return mergeByPk(
			[],
			(await idb.cache.players.getAll()).filter((p) => p.hof === 1),
			"players",
			type,
		).filter(filter);
	}

	if (draftYear !== undefined) {
		const lid = getLid();
		if (lid !== undefined) {
			const sqlitePlayers = await readPlayersFilter(lid, { draftYear });
			if (sqlitePlayers !== null) {
				return mergeByPk(
					sqlitePlayers,
					(
						await idb.cache.players.indexGetAll("playersByTid", [
							PLAYER.RETIRED,
							Infinity,
						])
					).filter((p) => p.draft.year === draftYear),
					"players",
					type,
				);
			}
		}

		return mergeByPk(
			[],
			(
				await idb.cache.players.indexGetAll("playersByTid", [
					PLAYER.RETIRED,
					Infinity,
				])
			).filter((p) => p.draft.year === draftYear),
			"players",
			type,
		);
	}

	if (statsTid !== undefined) {
		const lid = getLid();
		if (lid !== undefined) {
			const sqlitePlayers = await readPlayersFilter(lid, { statsTid });
			if (sqlitePlayers !== null) {
				return mergeByPk(
					sqlitePlayers,
					([] as Player[])
						.concat(
							await idb.cache.players.indexGetAll(
								"playersByTid",
								PLAYER.RETIRED,
							),
							await idb.cache.players.indexGetAll("playersByTid", [
								PLAYER.FREE_AGENT,
								Infinity,
							]),
						)
						.filter((p) => p.statsTids?.includes(statsTid)),
					"players",
					type,
				);
			}
		}

		return mergeByPk(
			[],
			([] as Player[])
				.concat(
					await idb.cache.players.indexGetAll("playersByTid", PLAYER.RETIRED),
					await idb.cache.players.indexGetAll("playersByTid", [
						PLAYER.FREE_AGENT,
						Infinity,
					]),
				)
				.filter((p) => p.statsTids.includes(statsTid)),
			"players",
			type,
		);
	}

	if (note) {
		const lid = getLid();
		if (lid !== undefined) {
			const sqlitePlayers = await readPlayersFilter(lid, { note: true });
			if (sqlitePlayers !== null) {
				return mergeByPk(
					sqlitePlayers,
					await idb.cache.players.getAll(),
					"players",
					type,
				).filter((p) => p.noteBool === 1 && filter(p));
			}
		}

		return mergeByPk(
			[],
			await idb.cache.players.getAll(),
			"players",
			type,
		).filter((p) => p.noteBool === 1 && filter(p));
	}

	if (watch) {
		const lid = getLid();
		if (lid !== undefined) {
			const sqlitePlayers = await readPlayersFilter(lid, { watch: true });
			if (sqlitePlayers !== null) {
				return mergeByPk(
					sqlitePlayers,
					await idb.cache.players.getAll(),
					"players",
					type,
				).filter((p) => p.watch !== undefined && filter(p));
			}
		}

		return mergeByPk(
			[],
			await idb.cache.players.getAll(),
			"players",
			type,
		).filter((p) => p.watch !== undefined && filter(p));
	}

	// Default: all players
	const lid = getLid();
	if (lid !== undefined) {
		const sqlitePlayers = await readPlayersFilter(lid, {});
		if (sqlitePlayers !== null) {
			return mergeByPk(
				sqlitePlayers,
				await idb.cache.players.getAll(),
				"players",
				type,
			).filter(filter);
		}
	}

	return mergeByPk(
		[],
		await idb.cache.players.getAll(),
		"players",
		type,
	).filter(filter);
};

export default getCopies;
