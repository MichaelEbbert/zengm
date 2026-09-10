import { PHASE } from "../../common/constants.ts";
import { idb } from "../db/index.ts";
import { g } from "../util/index.ts";
import getMatchups from "../core/preseason/getMatchups.ts";
import type { UpdateEvents } from "../../common/types.ts";

const updatePreseasonGames = async (
	_inputs: unknown,
	updateEvents: UpdateEvents,
) => {
	if (
		!updateEvents.includes("firstRun") &&
		!updateEvents.includes("newPhase")
	) {
		return;
	}

	// The link is always visible, like Trade is after the deadline, so the page
	// itself explains when it isn't usable.
	if (g.get("phase") !== PHASE.PRESEASON) {
		return {
			errorMessage:
				"Preseason games are only available during the preseason. Advance to the preseason to play them.",
		};
	}

	const matchups = await getMatchups();

	const teams = await idb.getCopies.teamsPlus(
		{
			attrs: ["tid", "abbrev", "region", "name"],
			season: g.get("season"),
		},
		"noCopyCache",
	);
	const teamsByTid = new Map(teams.map((t: any) => [t.tid, t]));

	const describe = (tid: number) => {
		const t = teamsByTid.get(tid);
		return {
			tid,
			abbrev: t?.abbrev ?? "???",
			region: t?.region ?? "",
			name: t?.name ?? "Unknown Team",
		};
	};

	const weeks = [...new Set(matchups.map((m) => m.week))].sort((a, b) => a - b);

	return {
		weeks: weeks.map((week) => ({
			week,
			games: matchups
				.filter((m) => m.week === week)
				.map((m) => ({
					idx: m.idx,
					home: describe(m.homeTid),
					away: describe(m.awayTid),
					homePts: m.homePts,
					awayPts: m.awayPts,
					played: m.homePts !== undefined,
				})),
		})),
		season: g.get("season"),
		userTid: g.get("userTid"),
	};
};

export default updatePreseasonGames;
