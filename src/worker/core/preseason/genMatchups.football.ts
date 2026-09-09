import { randInt } from "../../../common/random.ts";

export type PreseasonMatchup = {
	week: number;
	homeTid: number;
	awayTid: number;
};

export const NUM_PRESEASON_WEEKS = 3;

// Week 3 is the rematch of last season's final, when there was one.
export const REMATCH_WEEK = 3;

const pairKey = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);

// Give up avoiding a repeat after this many draws. Only reachable in a league
// with very few teams, where there aren't 3 distinct pairs to be had.
const MAX_DRAWS = 200;

const drawPair = (
	pool: number[],
	used: Set<string>,
): [number, number] | undefined => {
	if (pool.length < 2) {
		return undefined;
	}

	let fallback: [number, number] | undefined;

	for (let i = 0; i < MAX_DRAWS; i++) {
		const a = pool[randInt(0, pool.length - 1)]!;
		const b = pool[randInt(0, pool.length - 1)]!;
		if (a === b) {
			continue;
		}

		fallback ??= [a, b];

		if (!used.has(pairKey(a, b))) {
			return [a, b];
		}
	}

	return fallback;
};

/**
 * Pick the preseason matchups for one season.
 *
 * Weeks 1 and 2 are drawn at random -- any team may face any other, with no
 * regard to conference, division or record. Week 3 replays last season's
 * final. No pair repeats across the three weeks, though a team may well turn
 * up in more than one of them (with ~32 teams that happens about a third of
 * the time, and it is allowed).
 *
 * Everything it needs is passed in, so it stays pure and testable; reading the
 * standings is the caller's job. Pass `champTid`/`runnerUpTid` as undefined
 * when there is no previous season, no playoffs were played, or either team
 * can't be resolved -- week 3 then falls back to a random pair like the others.
 */
const genMatchups = ({
	tids,
	champTid,
	runnerUpTid,
}: {
	tids: number[];
	champTid?: number;
	runnerUpTid?: number;
}): PreseasonMatchup[] => {
	const pool = [...new Set(tids)];
	if (pool.length < 2) {
		return [];
	}

	const used = new Set<string>();
	const pairs = new Map<number, [number, number]>();

	// Seed the rematch first so it is guaranteed a slot, then let the random
	// weeks work around it.
	if (
		champTid !== undefined &&
		runnerUpTid !== undefined &&
		champTid !== runnerUpTid &&
		pool.includes(champTid) &&
		pool.includes(runnerUpTid)
	) {
		pairs.set(REMATCH_WEEK, [champTid, runnerUpTid]);
		used.add(pairKey(champTid, runnerUpTid));
	}

	for (let week = 1; week <= NUM_PRESEASON_WEEKS; week++) {
		if (pairs.has(week)) {
			continue;
		}

		const pair = drawPair(pool, used);
		if (pair) {
			pairs.set(week, pair);
			used.add(pairKey(pair[0], pair[1]));
		}
	}

	const matchups: PreseasonMatchup[] = [];
	for (let week = 1; week <= NUM_PRESEASON_WEEKS; week++) {
		const pair = pairs.get(week);
		if (!pair) {
			continue;
		}

		const flip = randInt(0, 1) === 1;
		matchups.push({
			week,
			homeTid: flip ? pair[1] : pair[0],
			awayTid: flip ? pair[0] : pair[1],
		});
	}

	return matchups;
};

export default genMatchups;
