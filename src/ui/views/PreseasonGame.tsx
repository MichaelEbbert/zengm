import type { View } from "../../common/types.ts";
import useTitleBar from "../hooks/useTitleBar.tsx";
import { helpers } from "../util/helpers.ts";
import { LiveGame } from "./LiveGame/index.tsx";

const PreseasonGame = ({ liveSim }: View<"preseasonGame">) => {
	const teamName = (t: (typeof liveSim)["initialBoxScore"]["teams"][number]) =>
		`${t.region} ${t.name}`;

	useTitleBar({
		title: "Preseason Game",
		titleLong: `Preseason Game » ${teamName(
			liveSim.initialBoxScore.teams[0],
		)} vs ${teamName(liveSim.initialBoxScore.teams[1])}`,
		hideNewWindow: true,
	});

	return (
		<>
			<p>
				<a href={helpers.leagueUrl(["preseason_games"])}>
					Back to preseason games
				</a>
			</p>
			<LiveGame {...liveSim} />
		</>
	);
};

export default PreseasonGame;
