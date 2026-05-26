import { idb } from "../db/index.ts";

const getNewLeagueLid = async () => {
	const cursor = await (
		await idb.meta.transaction("leagues")
	).store.openCursor(undefined, "prev");
	const lastLid = cursor ? cursor.value.lid + 1 : 1;
	return Math.max(Date.now(), lastLid);
};

export default getNewLeagueLid;
