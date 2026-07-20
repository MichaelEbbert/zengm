import { metaGetLeague } from "../../db/electronApi.ts";
import { g } from "../../util/index.ts";

const getName = async () => {
	const lid = g.get("lid");
	const l = await metaGetLeague(lid);
	if (l) {
		return l.name;
	}

	return "Unknown league";
};

export default getName;
