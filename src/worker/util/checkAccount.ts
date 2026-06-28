import { ACCOUNT_API_URL, GRACE_PERIOD } from "../../common/constants.ts";
import local from "./local.ts";
import toUI from "./toUI.ts";
import type { Conditions, PartialTopMenu } from "../../common/types.ts";
import { fetchWrapper } from "../../common/fetchWrapper.ts";

const checkAccount = async (
	conditions: Conditions,
): Promise<PartialTopMenu> => {
	try {
		const data = await fetchWrapper({
			url: `${ACCOUNT_API_URL}/user_info.php`,
			method: "GET",
			data: {
				sport: process.env.SPORT,
			},
			credentials: "include",
		});

		// Keep track of latest here, for ads and multi tab sync
		local.goldUntil = data.gold_until;
		local.mailingList = !!data.mailing_list;
		local.email = data.username === "" ? undefined : data.email;
		local.username = data.username === "" ? undefined : data.username;
		const currentTimestamp = Math.floor(Date.now() / 1000) - GRACE_PERIOD;
		await toUI("updateLocal", [
			{
				email: local.email,
				gold: currentTimestamp <= data.gold_until,
				username: local.username,
			},
		]);

		// Achievement sync to remote disabled: achievements stored in SQLite only

		return {
			email: data.email,
			goldCancelled: !!data.gold_cancelled,
			goldUntil: data.gold_until,
			username: data.username,
			mailingList: !!data.mailing_list,
		};
	} catch (error) {
		// Don't freak out if an AJAX request fails or whatever
		console.log(error);
		return {
			email: "",
			goldCancelled: false,
			goldUntil: Infinity,
			username: "",
			mailingList: false,
		};
	}
};

export default checkAccount;
