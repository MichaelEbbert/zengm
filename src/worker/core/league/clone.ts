import {
	metaGetAllLeagues,
	metaGetLeague,
	metaPutLeague,
	cloneLeague as electronCloneLeague,
} from "../../db/electronApi.ts";
import { getNewLeagueLid } from "../../util/index.ts";
import remove from "./remove.ts";

export const getCloneName = (nameOld: string, namesOld: string[]) => {
	const matches = nameOld.match(
		/^(?<root>.*?)( \(clone( (?<number>\d+))?\))?$/,
	);

	const root = matches?.groups?.root;
	if (root === undefined) {
		return `${nameOld} (clone)`;
	}

	const numberString = matches?.groups?.number;
	let number =
		numberString !== undefined ? Number.parseInt(numberString) + 1 : 1;

	while (true) {
		const name = `${root} (clone${number > 1 ? ` ${number}` : ""})`;

		if (namesOld.every((name2) => name !== name2)) {
			return name;
		}

		number += 1;
	}
};

const clone = async (lidOld: number) => {
	const leagueOld = await metaGetLeague(lidOld);
	if (!leagueOld) {
		throw new Error("League not found");
	}

	const allLeagues = (await metaGetAllLeagues()) ?? [];
	const namesOld = allLeagues.map((league) => league.name);
	const name = getCloneName(leagueOld.name, namesOld);

	const lid = await getNewLeagueLid();
	await remove(lid);

	const leagueNew = {
		lid,
		name,
		tid: leagueOld.tid,
		phaseText: leagueOld.phaseText,
		teamName: leagueOld.teamName,
		teamRegion: leagueOld.teamRegion,
		difficulty: leagueOld.difficulty,
		startingSeason: leagueOld.startingSeason,
		season: leagueOld.season,
		imgURL: leagueOld.imgURL,
		created: new Date(),
		lastPlayed: new Date(),
	};
	await metaPutLeague(leagueNew);

	await electronCloneLeague(lidOld, lid);

	return name;
};

export default clone;
