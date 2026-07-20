import close from "./close.ts";
import { metaDeleteLeague } from "../../db/electronApi.ts";
import { g } from "../../util/index.ts";

const remove = async (lid: number) => {
	const { wlog } = await import("../../db/workerLog.ts");
	await wlog(`league deleted lid=${lid}`);
	if (g.get("lid") === lid) {
		close(true);
	}

	await metaDeleteLeague(lid);
};

export default remove;
