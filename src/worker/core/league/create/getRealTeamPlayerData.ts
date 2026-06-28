import type { Conditions } from "../../../../common/types.ts";

const getRealTeamPlayerData = async (
	_params: {
		fileHasPlayers: boolean;
		fileHasTeams: boolean;
	},
	_conditions: Conditions | undefined,
) => {
	// realPlayerPhotos and realTeamInfo not used in this fork
	return {
		realPlayerPhotos: undefined,
		realTeamInfo: undefined,
	};
};

export default getRealTeamPlayerData;
