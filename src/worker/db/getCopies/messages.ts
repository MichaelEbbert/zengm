import { idb } from "../index.ts";
import { readMessages as electronReadMessages } from "../electronApi.ts";
import { maybeDeepCopy, mergeByPk } from "./helpers.ts";
import type { GetCopyType, Message } from "../../../common/types.ts";
import { g } from "../../util/index.ts";

const getLastEntries = <T>(arr: T[], limit: number): T[] => {
	return arr.slice(arr.length - limit);
};

const getCopies = async (
	{
		limit,
		mid,
	}: {
		limit?: number;
		mid?: number;
	} = {},
	type?: GetCopyType,
): Promise<Message[]> => {
	let lid: number | undefined;
	try {
		lid = g.get("lid") as number;
	} catch {}

	if (mid !== undefined) {
		const message = await idb.cache.messages.get(mid);
		if (message) {
			return [maybeDeepCopy(message, type)];
		}

		if (typeof lid === "number") {
			const sqliteMsgs = await electronReadMessages(lid, { mid });
			if (sqliteMsgs && sqliteMsgs.length > 0) return sqliteMsgs as Message[];
		}

		return [];
	}

	if (limit !== undefined) {
		let fromDb: Message[];
		if (typeof lid === "number") {
			fromDb =
				((await electronReadMessages(lid, { limit })) as Message[]) ?? [];
		} else {
			fromDb = [];
		}

		const fromCache = await idb.cache.messages.getAll();

		const messages = mergeByPk(
			fromDb,
			getLastEntries(fromCache, limit),
			"messages",
			type,
		);

		return getLastEntries(messages, limit);
	}

	let fromDb: Message[];
	if (typeof lid === "number") {
		fromDb = ((await electronReadMessages(lid)) as Message[]) ?? [];
	} else {
		fromDb = [];
	}

	return mergeByPk(fromDb, await idb.cache.messages.getAll(), "messages", type);
};

export default getCopies;
