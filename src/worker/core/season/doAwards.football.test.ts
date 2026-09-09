import { assert, test } from "vitest";
import { leagueLeaderCategories } from "./doAwards.football.ts";
import getLeaderRequirements from "./getLeaderRequirements.ts";
import { resetG } from "../../../test/helpers.ts";

// leagueLeaders() in awards.ts throws on any category with no entry here, which
// aborts the awards phase change and strands the league after the Super Bowl.
// That is how "Missing leader requirements for totTD" got shipped in the 2001
// upstream sync -- see docs/upstream_sync_log.md.
test("every league leader award category has leader requirements", () => {
	resetG();

	const requirements = getLeaderRequirements();

	for (const { name, stat } of leagueLeaderCategories) {
		assert(requirements[stat], `${name}: no leader requirements for "${stat}"`);
	}
});
