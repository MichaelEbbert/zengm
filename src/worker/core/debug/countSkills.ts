import { player } from "../index.ts";
import { idb } from "../../db/index.ts";
import { last } from "../../../common/utils.ts";

const countSkills = async () => {
	// All non-retired players
	const players = await idb.cache.players.getAll();
	const counts: Record<string, number> = {};

	for (const p of players) {
		const r = last(p.ratings);

		// Dynamically recompute, to make dev easier when changing skills formula
		const skills = player.skills(r);

		for (const skill of skills) {
			if (counts[skill] === undefined) {
				counts[skill] = 0;
			}
			counts[skill] += 1;
		}
	}

	console.table(counts);
};

export default countSkills;
