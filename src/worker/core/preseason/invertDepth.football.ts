import { POSITIONS } from "../../../common/constants.football.ts";
import type { Position } from "../../../common/types.football.ts";

// Positions that are one-deep by design. Rotating them just means playing a
// worse kicker all game, which isn't interesting, and both sit in
// FEWER_INJURIES_POS anyway.
const SKIP_POSITIONS = new Set<string>(["K", "P"]);

type FootballDepth = Record<string, number[]>;

/**
 * Flip a depth chart so the buried players start.
 *
 * Only players whose *natural* position matches are moved, and they only ever
 * trade places with each other: the slots holding out-of-position players are
 * left exactly as they were. That matters, because a depth array holds the
 * entire roster, not just the players who actually play that position -- see
 * genDepth.football.ts, which does `depth[pos] = players.map(p => p.pid)` for
 * every position. Reversing the whole array would put a kicker at defensive
 * tackle.
 *
 * Note that natural-position players are not necessarily a contiguous run at
 * the top. genDepth sorts by `ovrs[pos]` plus a +15 bonus for natural position,
 * so a well-rated out-of-position player can outrank a weak natural one, and
 * the user can reorder the chart by hand besides. Permuting in place is what
 * keeps this safe in those cases.
 *
 * Pure: the input is never mutated.
 */
const invertDepth = (
	depth: FootballDepth,
	posByPid: Map<number, Position | string>,
): FootballDepth => {
	const inverted: FootballDepth = {};

	for (const pos of Object.keys(depth)) {
		const pids = depth[pos]!;

		if (SKIP_POSITIONS.has(pos) || !POSITIONS.includes(pos as Position)) {
			inverted[pos] = [...pids];
			continue;
		}

		// The slots currently held by players who actually play this position.
		const slots: number[] = [];
		for (const [i, pid] of pids.entries()) {
			if (posByPid.get(pid) === pos) {
				slots.push(i);
			}
		}

		const next = [...pids];

		// Reverse those players among themselves, leaving every other slot alone.
		for (const [n, slot] of slots.entries()) {
			next[slot] = pids[slots[slots.length - 1 - n]!]!;
		}

		inverted[pos] = next;
	}

	return inverted;
};

export default invertDepth;
