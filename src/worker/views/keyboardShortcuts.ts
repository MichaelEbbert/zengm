import { metaGetAttribute } from "../db/electronApi.ts";
import { idb } from "../db/index.ts";
import type { UpdateEvents } from "../../common/types.ts";
import type { KeyboardShortcutsLocal } from "../../ui/util/keyboardShortcuts.ts";

const updateKeyboardShortcuts = async (
	inputs: unknown,
	updateEvents: UpdateEvents,
) => {
	if (updateEvents.includes("firstRun")) {
		const keyboardShortcutsLocal = ((await metaGetAttribute(
			"keyboardShortcuts",
		)) ??
			(await (
				await idb.meta.transaction("attributes")
			).store.get("keyboardShortcuts"))) as KeyboardShortcutsLocal | undefined;

		return {
			keyboardShortcutsLocal,
		};
	}
};

export default updateKeyboardShortcuts;
