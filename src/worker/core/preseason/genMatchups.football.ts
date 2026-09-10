import { shuffle } from "../../../common/random.ts";

export type PreseasonMatchup = {
	week: number;
	idx: number;
	homeTid: number;
	awayTid: number;
};

export const NUM_PRESEASON_WEEKS = 3;

// Week 3 carries the rematch of last season's final, when there was one.
export const REMATCH_WEEK = 3;

const pairKey = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);

// Each week is drawn by shuffling and pairing greedily, which can paint itself
// into a corner near the end -- the last two teams left may already have played
// each other. Reshuffling is far simpler than backtracking and succeeds almost
// immediately, so just try again.
const MAX_WEEK_ATTEMPTS = 200;

/**
 * Pair off every team for one week, avoiding any matchup already used.
 *
 * `fixed` is placed first and its two teams are excluded from the draw, which
 * is how the Super Bowl rematch claims its slot in week 3. With an odd number
 * of teams, one is left over and gets a bye.
 *
 * Returns undefined if it could not find a full slate.
 */
const pairWeek = (
	tids: number[],
	used: Set<string>,
	fixed?: [number, number],
): [number, number][] | undefined => {
	for (let attempt = 0; attempt < MAX_WEEK_ATTEMPTS; attempt++) {
		const pairs: [number, number][] = [];

		let remaining = [...tids];
		if (fixed) {
			remaining = remaining.filter((tid) => !fixed.includes(tid));
			pairs.push(fixed);
		}

		shuffle(remaining);

		let failed = false;
		while (remaining.length > 1) {
			const a = remaining.shift()!;

			const j = remaining.findIndex((b) => !used.has(pairKey(a, b)));
			if (j === -1) {
				// `a` has already played everyone still unpaired. Reshuffle.
				failed = true;
				break;
			}

			const [b] = remaining.splice(j, 1) as [number];
			pairs.push([a, b]);
		}

		if (!failed) {
			// remaining.length is 0 or 1 here; a leftover team has a bye.
			return pairs;
		}
	}

	return undefined;
};

/**
 * Build the full preseason: three weeks, with every team playing a random
 * opponent each week.
 *
 * Opponents are drawn without regard to conference, division or record, and no
 * team faces the same opponent twice across the three weeks -- so each team
 * gets three different opponents. One game in week 3 is a rematch of last
 * season's final.
 *
 * With an odd number of teams, one team has a bye each week.
 *
 * Everything it needs is passed in, so it stays pure and testable; reading the
 * standings is the caller's job. Pass `champTid`/`runnerUpTid` as undefined
 * when there is no previous season, no playoffs were played, or either team
 * can't be resolved -- week 3 is then drawn like any other week.
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

	const haveRematch =
		champTid !== undefined &&
		runnerUpTid !== undefined &&
		champTid !== runnerUpTid &&
		pool.includes(champTid) &&
		pool.includes(runnerUpTid);

	const used = new Set<string>();
	const byWeek = new Map<number, [number, number][]>();

	// Week 3 first, so the rematch is guaranteed its slot and the random weeks
	// have to work around it rather than the other way round.
	const order = [REMATCH_WEEK];
	for (let week = 1; week <= NUM_PRESEASON_WEEKS; week++) {
		if (week !== REMATCH_WEEK) {
			order.push(week);
		}
	}

	for (const week of order) {
		const fixed =
			week === REMATCH_WEEK && haveRematch
				? ([champTid, runnerUpTid] as [number, number])
				: undefined;

		const pairs = pairWeek(pool, used, fixed);
		if (!pairs) {
			// Not enough distinct opponents left to fill this week. Only reachable
			// in a tiny league; skip the week rather than fail the whole preseason.
			continue;
		}

		byWeek.set(week, pairs);
		for (const [a, b] of pairs) {
			used.add(pairKey(a, b));
		}
	}

	const matchups: PreseasonMatchup[] = [];
	for (let week = 1; week <= NUM_PRESEASON_WEEKS; week++) {
		const pairs = byWeek.get(week);
		if (!pairs) {
			continue;
		}

		for (const [idx, [a, b]] of pairs.entries()) {
			const flip = Math.random() < 0.5;
			matchups.push({
				week,
				idx,
				homeTid: flip ? b : a,
				awayTid: flip ? a : b,
			});
		}
	}

	return matchups;
};

export default genMatchups;
