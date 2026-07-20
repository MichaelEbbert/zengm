import { COMPOSITE_WEIGHTS } from "../../../common/constants.ts";
import { player } from "../index.ts";
import { idb } from "../../db/index.ts";
import { last } from "../../../common/utils.ts";

const compositeRatingDists = async () => {
	// All non-retired players
	const players = await idb.cache.players.getAll();
	const compositeRatings = players
		.map((p) => {
			return player.compositeRating(
				last(p.ratings),
				COMPOSITE_WEIGHTS.shootingThreePointer!.ratings,
				COMPOSITE_WEIGHTS.shootingThreePointer!.weights,
				false,
			);
		})
		.sort((a, b) => b - a);
	console.log(compositeRatings);
};

export default compositeRatingDists;
