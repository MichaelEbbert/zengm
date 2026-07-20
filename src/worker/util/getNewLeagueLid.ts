import { metaGetMaxLeagueLid } from "../db/electronApi.ts";

const getNewLeagueLid = async () => {
	const sqliteMax = (await metaGetMaxLeagueLid()) ?? -1;
	return Math.max(Date.now(), sqliteMax + 1);
};

export default getNewLeagueLid;
