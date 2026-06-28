import { metaGetMaxLeagueLid } from "../db/electronApi.ts";
import { idb } from "../db/index.ts";

const getNewLeagueLid = async () => {
	const sqliteMax = await metaGetMaxLeagueLid();
	if (sqliteMax !== null) {
		return Math.max(Date.now(), sqliteMax + 1);
	}
	// Fallback to IDB when not in Electron
	const cursor = await (
		await idb.meta.transaction("leagues")
	).store.openCursor(undefined, "prev");
	const lastLid = cursor ? cursor.value.lid + 1 : 1;
	return Math.max(Date.now(), lastLid);
};

export default getNewLeagueLid;
