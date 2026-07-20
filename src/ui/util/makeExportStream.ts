import { LEAGUE_DATABASE_VERSION } from "../../common/constants.ts";
import {
	gameAttributesCache,
	gameAttributesKeysOtherSports,
} from "../../common/defaultGameAttributes.ts";
import { gameAttributesArrayToObject } from "../../common/gameAttributesArrayToObject.ts";
import { local } from "./local.ts";
import { toWorker } from "./toWorker.ts";

// Otherwise it often pulls just one record per transaction, as it's hitting up against the high water mark
const TWENTY_MEGABYTES_IN_BYTES = 20 * 1024 * 1024;

const highWaterMark = TWENTY_MEGABYTES_IN_BYTES;
const minSizePerPull = TWENTY_MEGABYTES_IN_BYTES;

const stringSizeInBytes = (str: string | undefined) => {
	if (!str) {
		return 0;
	}

	// https://stackoverflow.com/a/23329386/786644
	let s = str.length;
	for (let i = str.length - 1; i >= 0; i--) {
		const code = str.charCodeAt(i);
		if (code > 0x7f && code <= 0x7ff) {
			s++;
		} else if (code > 0x7ff && code <= 0xffff) {
			s += 2;
		}
		if (code >= 0xdc00 && code <= 0xdfff) {
			i--;
		}
	}
	return s;
};

const NUM_SPACES_IN_TAB = 2;

type ProcessStores<ReturnType> = Partial<
	Record<string, (a: any) => ReturnType>
>;

const makeExportStream = async (
	storesInput: string[],
	{
		abortSignal,
		compressed = false,
		filter = {},
		forEach = {},
		map = {},
		name,
		onPercentDone,
		onProcessingStore,
		signal,
	}: {
		abortSignal?: AbortSignal;
		compressed?: boolean;
		filter?: ProcessStores<boolean>;
		forEach?: ProcessStores<void>;
		map?: ProcessStores<any>;
		name?: string;
		onPercentDone?: (percentDone: number) => void;
		onProcessingStore?: (processingStore: string) => void;
		signal?: AbortSignal;
	},
) => {
	const lid = local.getState().lid;
	if (lid === undefined) {
		throw new Error("Missing lid");
	}

	// Get all data from the worker (cache is flushed first inside the worker)
	const exportData = await toWorker("main", "getLeagueExportData", storesInput);
	const { filteredStores, stores: storeData } = exportData as {
		filteredStores: string[];
		stores: Record<string, any[]>;
	};

	const space = compressed ? "" : " ";
	const tab = compressed ? "" : " ".repeat(NUM_SPACES_IN_TAB);
	const newline = compressed ? "" : "\n";

	const jsonStringify = (object: any, indentationLevels: number) => {
		if (compressed) {
			return JSON.stringify(object);
		}

		const json = JSON.stringify(object, null, NUM_SPACES_IN_TAB);

		return json.replaceAll("\n", `\n${tab.repeat(indentationLevels)}`);
	};

	// Count total records for progress
	let numRecordsTotal = 0;
	for (const store of filteredStores) {
		numRecordsTotal += storeData[store]?.length ?? 0;
	}

	let storeIndex = 0;
	let recordIndex = 0;
	let prevPercentDone = 0;
	let numRecordsSeen = 0;
	let cancelled = false;
	let cancelCallback: (() => void) | undefined;
	const enqueuedFirstRecord = new Set<string>();
	let prevStore: string | undefined;

	const incrementNumRecordsSeen = (count: number = 1) => {
		numRecordsSeen += count;
		if (onPercentDone) {
			const percentDone = Math.round((numRecordsSeen / numRecordsTotal) * 100);
			if (percentDone !== prevPercentDone) {
				onPercentDone(percentDone);
				prevPercentDone = percentDone;
			}
		}
	};

	return new ReadableStream<string>(
		{
			async start(controller) {
				signal?.addEventListener("abort", () => {
					controller.error(new DOMException("Aborted", "AbortError"));
				});

				await controller.enqueue(
					`{${newline}${tab}"version":${space}${LEAGUE_DATABASE_VERSION}`,
				);

				if (name) {
					controller.enqueue(
						`,${newline}${tab}"meta":${space}${jsonStringify({ name }, 1)}`,
					);
				}
			},

			async pull(controller) {
				if (cancelled || abortSignal?.aborted) {
					if (cancelCallback) cancelCallback();
					controller.close();
					return;
				}

				let size = 0;
				const enqueue = (string: string) => {
					size += stringSizeInBytes(string);
					controller.enqueue(string);
				};

				while (storeIndex < filteredStores.length) {
					const store = filteredStores[storeIndex]!;

					if (onProcessingStore && store !== prevStore) {
						onProcessingStore(store);
						prevStore = store;
					}

					const records = storeData[store] ?? [];

					if (store === "gameAttributes") {
						let rows = records.filter(
							(row: any) => !gameAttributesCache.includes(row.key),
						);
						rows = rows.filter(
							(row: any) => !gameAttributesKeysOtherSports.has(row.key),
						);
						if (filter[store]) {
							rows = rows.filter(filter[store]);
						}
						if (forEach[store]) {
							for (const row of rows) {
								forEach[store]!(row);
							}
						}
						if (map[store]) {
							rows = rows.map(map[store]);
						}
						const gameAttributesObject = gameAttributesArrayToObject(rows);
						enqueue(
							`,${newline}${tab}"gameAttributes":${space}${jsonStringify(gameAttributesObject, 1)}`,
						);
						incrementNumRecordsSeen();
						storeIndex++;
						recordIndex = 0;
					} else {
						while (recordIndex < records.length) {
							let value = records[recordIndex]!;
							recordIndex++;

							if (filter[store] && !filter[store]!(value)) {
								incrementNumRecordsSeen();
								continue;
							}

							if (forEach[store]) {
								forEach[store]!(value);
							}

							if (store === "players" && value.imgURL) {
								delete value.face;
							}

							if (map[store]) {
								value = map[store]!(value);
							}

							const enqueuedFirst = enqueuedFirstRecord.has(store);
							const comma = enqueuedFirst ? "," : "";

							if (!enqueuedFirst) {
								enqueue(`,${newline}${tab}"${store}": [`);
								enqueuedFirstRecord.add(store);
							}

							enqueue(
								`${comma}${newline}${tab.repeat(2)}${jsonStringify(value, 2)}`,
							);

							incrementNumRecordsSeen();

							// Respect backpressure
							const desiredSize = controller.desiredSize;
							if (
								desiredSize !== null &&
								(desiredSize > 0 || size < minSizePerPull) &&
								!cancelCallback &&
								!abortSignal?.aborted
							) {
								// Keep going
							} else {
								return;
							}
						}

						// Done with this store
						if (enqueuedFirstRecord.has(store)) {
							enqueue(`${newline}${tab}]`);
						} else {
							enqueue("");
						}
						storeIndex++;
						recordIndex = 0;
					}

					if (storeIndex >= filteredStores.length) {
						await controller.enqueue(`${newline}}${newline}`);
						if (cancelCallback) cancelCallback();
						controller.close();
						return;
					}
				}

				// All stores done but close wasn't triggered yet
				if (storeIndex >= filteredStores.length) {
					await controller.enqueue(`${newline}}${newline}`);
					if (cancelCallback) cancelCallback();
					controller.close();
				}
			},

			cancel() {
				return new Promise((resolve) => {
					cancelled = true;
					cancelCallback = resolve;
				});
			},
		},
		{
			highWaterMark,
			size: stringSizeInBytes,
		},
	);
};

export default makeExportStream;
