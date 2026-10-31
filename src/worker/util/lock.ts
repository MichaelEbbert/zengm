import { idb } from "../db/index.ts";
import toUI from "./toUI.ts";
import type { Locks } from "../../common/types.ts";
import helpers from "./helpers.ts";

// These are transient variables that always reset to "false" on reload. See local.js for more.
const locks: Locks = {
	drafting: false,
	gameSim: false,
	newPhase: false,
	stopGameSim: false,
};

// Views and phase changes are mutually exclusive, because a phase change temporarily leaves data in an inconsistent state. So views wait for a phase change to finish, and a phase change waits for running views to finish. Never await toUI("realtimeUpdate") while holding the newPhase lock: the UI would wait on a view that is waiting on this lock.
let numViewsRunning = 0;
let onViewsDone: (() => void)[] = [];
let onNewPhaseDone: (() => void)[] = [];

const resolveAll = (callbacks: (() => void)[]) => {
	for (const callback of callbacks) {
		callback();
	}
};

const runView = async <T>(cb: () => Promise<T>) => {
	// Loop in case another phase change starts before this gets a chance to run, like during auto play
	while (locks.newPhase) {
		await new Promise<void>((resolve) => {
			onNewPhaseDone.push(resolve);
		});
	}

	numViewsRunning += 1;
	try {
		return await cb();
	} finally {
		numViewsRunning -= 1;
		if (numViewsRunning === 0) {
			const callbacks = onViewsDone;
			onViewsDone = [];
			resolveAll(callbacks);
		}
	}
};

const newPhaseUnlocked = () => {
	const callbacks = onNewPhaseDone;
	onNewPhaseDone = [];
	resolveAll(callbacks);
};

const reset = () => {
	for (const key of helpers.keys(locks)) {
		locks[key] = false;
	}
	newPhaseUnlocked();
};

const get = (name: keyof Locks): boolean => {
	return locks[name];
};

const set = async (name: keyof Locks, value: boolean) => {
	if (locks[name] === value) {
		// Short circuit to prevent realtimeUpdate
		return;
	}

	locks[name] = value;

	if (name === "newPhase") {
		if (value) {
			if (numViewsRunning > 0) {
				await new Promise<void>((resolve) => {
					onViewsDone.push(resolve);
				});
			}
		} else {
			newPhaseUnlocked();
		}
	}

	if (name === "gameSim") {
		await toUI("updateLocal", [
			{
				gameSimInProgress: value,
			},
		]);
	}
};

/**
 * Can new game simulations be started?
 *
 * Calls the callback function with either true or false. If games are in progress or any contract negotiation is in progress, false.
 *
 * @memberOf util.lock
 * @return {Promise.boolean}
 */
const canStartGames = () => {
	if (locks.newPhase) {
		return false;
	}

	if (locks.gameSim) {
		return false;
	}

	// Otherwise, doing it outside of this function would be a race condition if anything else async happened
	set("gameSim", true);
	return true;
};

/**
 * Is there an undread message from the owner?
 *
 * Calls the callback function with either true or false.
 *
 * @memberOf util.lock
 * @return {Promise.boolean}
 */
const unreadMessage = async () => {
	const messages = await idb.getCopies.messages(
		{
			limit: 10,
		},
		"noCopyCache",
	);

	return messages.some((message) => !message.read);
};

export default {
	reset,
	get,
	runView,
	set,
	canStartGames,
	unreadMessage,
};
