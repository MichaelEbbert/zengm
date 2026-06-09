import type { Game } from "../../../common/types.ts";
import { writeGame } from "../../db/electronApi.ts";
import { wlog } from "../../db/workerLog.ts";
import { g } from "../../util/index.ts";

export async function writeGameToSqlite(gameStats: Game): Promise<void> {
	await wlog(`writeGameToSqlite called gid=${gameStats.gid}`);
	let lid: number;
	try {
		lid = g.get("lid") as number;
	} catch {
		return;
	}
	if (typeof lid !== "number") return;
	await writeGame(lid, gameStats);
	await wlog(`writeGameToSqlite done gid=${gameStats.gid}`);
}
