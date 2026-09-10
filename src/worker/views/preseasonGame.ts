import { helpers } from "../util/index.ts";
import type { ViewInput } from "../../common/types.ts";

const updatePreseasonGame = async ({ liveSim }: ViewInput<"preseasonGame">) => {
	if (!liveSim) {
		return {
			redirectUrl: helpers.leagueUrl(["preseason_games"]),
		};
	}

	return {
		liveSim,
	};
};

export default updatePreseasonGame;
