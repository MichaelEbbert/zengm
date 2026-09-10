import type { Conditions } from "../../common/types.ts";
import simMatchup from "../core/preseason/simMatchup.ts";

// Imported directly rather than through the core barrel, to keep the number of
// upstream-owned files this feature touches as small as possible.
export const simPreseasonGame = async (
	{ week, idx }: { week: number; idx: number },
	conditions: Conditions,
) => {
	await simMatchup(week, idx, conditions);
};
