import { MoreLinks } from "../components/MoreLinks.tsx";
import useTitleBar from "../hooks/useTitleBar.tsx";
import { helpers } from "../util/helpers.ts";
import type { View } from "../../common/types.ts";
import { SafeHtml } from "../components/SafeHtml.tsx";
import { PHASE_TEXT } from "../../common/constants.ts";
import type { Phase } from "../../common/types.ts";

// "2002 Week 5" in the regular season, "2002 Free agency" otherwise. Events saved before phase was recorded only have the season.
const whenText = ({
	phase,
	season,
	week,
}: {
	phase?: Phase;
	season: number;
	week?: number;
}) => {
	if (week !== undefined) {
		return `${season} Week ${week}`;
	}
	if (phase !== undefined) {
		return `${season} ${helpers.upperCaseFirstLetter(PHASE_TEXT[phase])}`;
	}
	return String(season);
};

const Transactions = ({
	abbrev,
	eventType,
	events,
	season,
	tid,
}: View<"transactions">) => {
	useTitleBar({
		title: "Transactions",
		dropdownView: "transactions",
		dropdownFields: {
			teamsAndAll: abbrev,
			seasonsAndAll: season,
			eventType,
		},
	});

	const moreLinks =
		abbrev !== "all" ? (
			<MoreLinks
				type="team"
				page="depth"
				abbrev={abbrev}
				tid={tid}
				season={season !== "all" ? season : undefined}
			/>
		) : (
			<p>
				More: <a href={helpers.leagueUrl(["news", "all", season])}>News Feed</a>
			</p>
		);

	return (
		<>
			{moreLinks}

			<ul className="list-group">
				{events.map((e) => (
					<li key={e.eid} className="list-group-item">
						<span className="text-body-secondary me-2">{whenText(e)}</span>
						<SafeHtml dirty={e.text} />
					</li>
				))}
			</ul>
		</>
	);
};

export default Transactions;
