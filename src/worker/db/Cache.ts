import {
	ERROR_MESSAGE_UNDEFINED_SEASON,
	PLAYER,
} from "../../common/constants.ts";
import { helpers } from "../../common/helpers.ts";
import { idb } from "./index.ts";
import cmp from "./cmp.ts";
import { g, local, lock } from "../util/index.ts";
import {
	getMaxGameGid,
	flushPlayers,
	readActivePlayers as electronReadActivePlayers,
	countSqlitePlayers,
	flushTeams,
	readAllTeams as electronReadAllTeams,
	countSqliteTeams,
	flushTeamSeasons,
	readTeamSeasons as electronReadTeamSeasons,
	countSqliteTeamSeasons,
	flushTeamStats,
	readTeamStats as electronReadTeamStats,
	countSqliteTeamStats,
	flushGameAttributes,
	readAllGameAttributes,
	flushSchedule,
	readAllSchedule,
	countSqliteSchedule,
	flushDraftPicks,
	readAllDraftPicks,
	countSqliteDraftPicks,
	flushNegotiations,
	readAllNegotiations,
	countSqliteNegotiations,
	flushReleasedPlayers,
	readAllReleasedPlayers,
	countSqliteReleasedPlayers,
	flushTrade,
	readAllTrade,
	countSqliteTrade,
	flushSavedTrades,
	readAllSavedTrades,
	countSqliteSavedTrades,
	flushSavedTradingBlock,
	readAllSavedTradingBlock,
	countSqliteSavedTradingBlock,
	flushMessages,
	countSqliteMessages,
	getMaxMessageMid,
	flushAllStars,
	readAllStars as electronReadAllStars,
	countSqliteAllStars,
	flushAwards,
	readAwards as electronReadAwards,
	countSqliteAwards,
	flushDraftLotteryResults,
	readDraftLotteryResults as electronReadDraftLotteryResults,
	countSqliteDraftLotteryResults,
	flushEvents,
	countSqliteEvents,
	getMaxEventEid,
	flushHeadToHeads,
	readHeadToHeads as electronReadHeadToHeads,
	countSqliteHeadToHeads,
	flushPlayerFeats,
	countSqlitePlayerFeats,
	getMaxPlayerFeatFid,
	flushPlayoffSeries,
	readAllPlayoffSeries as electronReadAllPlayoffSeries,
	countSqlitePlayoffSeries,
	flushScheduledEvents,
	readScheduledEvents as electronReadScheduledEvents,
	countSqliteScheduledEvents,
	getMaxScheduledEventId,
	flushSeasonLeaders,
	readSeasonLeaders as electronReadSeasonLeaders,
	countSqliteSeasonLeaders,
} from "./electronApi.ts";
import type {
	AllStars,
	DraftLotteryResult,
	DraftPick,
	DraftPickWithoutKey,
	EventBBGM,
	GameAttribute,
	HeadToHead,
	Message,
	MessageWithoutKey,
	Negotiation,
	Player,
	PlayerWithoutKey,
	PlayerFeat,
	PlayerFeatWithoutKey,
	PlayoffSeries,
	ReleasedPlayer,
	ReleasedPlayerWithoutKey,
	SavedTrade,
	ScheduleGame,
	ScheduleGameWithoutKey,
	ScheduledEvent,
	ScheduledEventWithoutKey,
	TeamSeason,
	TeamSeasonWithoutKey,
	TeamStats,
	TeamStatsWithoutKey,
	Team,
	Trade,
	EventBBGMWithoutKey,
	SeasonLeaders,
	SavedTradingBlock,
	NonEmptyArray,
} from "../../common/types.ts";
import type { IDBPTransaction } from "@dumbmatter/idb";
import type { LeagueDB } from "./connectLeague.ts";
import { league } from "../core/index.ts";

export const NUM_SEASON_LEADERS_CACHE = 50;

type Status = "empty" | "error" | "filling" | "full";

// Only these IDB object stores for now. Keep in memory only player info for non-retired players and team info for the current season.
export type Store =
	| "allStars"
	| "awards"
	| "draftLotteryResults"
	| "draftPicks"
	| "events"
	| "gameAttributes"
	| "headToHeads"
	| "messages"
	| "negotiations"
	| "playerFeats"
	| "players"
	| "playoffSeries"
	| "releasedPlayers"
	| "savedTrades"
	| "savedTradingBlock"
	| "schedule"
	| "scheduledEvents"
	| "seasonLeaders"
	| "teamSeasons"
	| "teamStats"
	| "teams"
	| "trade";
type Index =
	| "draftPicksBySeason"
	| "draftPicksByTid"
	| "playersByDraftYearRetiredYear"
	| "playersByTid"
	| "releasedPlayers"
	| "releasedPlayersByTid"
	| "teamSeasonsBySeasonTid"
	| "teamSeasonsByTidSeason"
	| "teamStatsByPlayoffsTid";

export const STORES: Store[] = [];
const AUTO_FLUSH_INTERVAL = 4000; // 4 seconds

export const NUM_PRIOR_SEASONS_TEAM_SEASONS = 2;

// Hacks to support stringifying/parsing an array containing strings and numbers, including Infinity. Currently used for retiredYear.
const stringifyInfinity = (array: (number | string | boolean)[]) => {
	return JSON.stringify(array);
};
const parseInfinity = (string: string) => {
	return JSON.parse(string).map((val: any) => (val === null ? Infinity : val));
};
const getIndexKey = (
	index: {
		key: NonEmptyArray<string>;
	},
	row: any,
) => {
	if (index.key.length === 1) {
		return row[index.key[0]];
	}

	// Array keys are special, because they need to be stored in a JS object and then recovered
	return stringifyInfinity(
		index.key.map((field) => {
			return field === "draft.year" ? row.draft.year : row[field];
		}),
	);
};

class StoreAPI<Input, Output, ID extends string | number> {
	cache: Cache;

	store: Store;

	constructor(cache: Cache, store: Store) {
		this.cache = cache;
		this.store = store;
	}

	get(id: ID): Promise<Output | undefined> {
		if (typeof id !== "number" && typeof id !== "string") {
			throw new Error("Invalid input type");
		}

		return this.cache._get(this.store, id);
	}

	getAll(): Promise<Output[]> {
		return this.cache._getAll(this.store);
	}

	// Not sure how to type key as ID in some methods below
	indexGet(
		index: Index,
		key: number | string | (number | string | boolean)[],
	): Promise<Output | undefined> {
		return this.cache._indexGet(index, key);
	}

	indexGetAll(
		index: Index,
		key: number | string | [any, any] | any[],
	): Promise<Output[]> {
		return this.cache._indexGetAll(index, key);
	}

	add(obj: Input): Promise<ID> {
		return this.cache._add(this.store, obj) as any;
	}

	put(obj: Input): Promise<ID> {
		return this.cache._put(this.store, obj) as any;
	}

	delete(id: ID): Promise<void> {
		return this.cache._delete(this.store, id);
	}

	clear(): Promise<void> {
		return this.cache._clear(this.store);
	}
}

class Cache {
	_data: Record<Store, any>;

	_deletes: Record<Store, Set<number | string>>;

	_dirty: boolean;

	_dirtyIndexes: Set<Store>;

	_dirtyRecords: Record<Store, Set<number | string>>;

	_index2store: Record<Index, Store>;

	_indexes: Record<Index, any>;

	_maxIds: Record<Store, number>;

	newLeague: boolean;

	_requestInd: number;

	_requestQueue: Map<
		number,
		{
			resolve: () => void;
			timeoutID: number;
			validStatuses: Status[];
		}
	>;

	_status: Status;

	_season: number | undefined;

	_stopAutoFlush: boolean;

	storeInfos: Record<
		Store,
		{
			pk: string;
			pkType: "number" | "string";
			autoIncrement: boolean;
			getData?: (
				tx: IDBPTransaction<LeagueDB>,
				season: number,
			) => Promise<any[]> | any[];
			indexes?: {
				name: Index;
				filter?: (a: any) => boolean;
				key: NonEmptyArray<string>;
				unique?: boolean;
			}[];

			// Should be true if we want to fetch data from getData on a new season, even with autoSave disabled. This happens if you use season in getData such that there are objects for future seasons left out of the cache.
			getDataWithAutoSaveDisabled?: boolean;
		}
	>;

	allStars: StoreAPI<AllStars, AllStars, number>;

	awards: StoreAPI<any, any, number>;

	draftLotteryResults: StoreAPI<DraftLotteryResult, DraftLotteryResult, number>;

	draftPicks: StoreAPI<DraftPickWithoutKey, DraftPick, number>;

	events: StoreAPI<EventBBGMWithoutKey, EventBBGM, number>;

	gameAttributes: StoreAPI<GameAttribute<any>, GameAttribute<any>, string>;

	headToHeads: StoreAPI<HeadToHead, HeadToHead, number>;

	messages: StoreAPI<MessageWithoutKey, Message, number>;

	negotiations: StoreAPI<Negotiation, Negotiation, number>;

	playerFeats: StoreAPI<PlayerFeatWithoutKey, PlayerFeat, number>;

	players: StoreAPI<PlayerWithoutKey, Player, number>;

	playoffSeries: StoreAPI<PlayoffSeries, PlayoffSeries, number>;

	releasedPlayers: StoreAPI<ReleasedPlayerWithoutKey, ReleasedPlayer, number>;

	savedTrades: StoreAPI<SavedTrade, SavedTrade, string>;

	savedTradingBlock: StoreAPI<SavedTradingBlock, SavedTradingBlock, number>;

	schedule: StoreAPI<ScheduleGameWithoutKey, ScheduleGame, number>;

	scheduledEvents: StoreAPI<ScheduledEventWithoutKey, ScheduledEvent, number>;

	seasonLeaders: StoreAPI<SeasonLeaders, SeasonLeaders, number>;

	teamSeasons: StoreAPI<TeamSeasonWithoutKey, TeamSeason, number>;

	teamStats: StoreAPI<TeamStatsWithoutKey, TeamStats, number>;

	teams: StoreAPI<Team, Team, number>;

	trade: StoreAPI<Trade, Trade, number>;

	constructor() {
		this._status = "empty";
		// @ts-expect-error
		this._data = {};
		// @ts-expect-error
		this._deletes = {};
		this._dirty = false;
		this._dirtyIndexes = new Set();
		// @ts-expect-error
		this._dirtyRecords = {};
		// @ts-expect-error
		this._indexes = {};
		// @ts-expect-error
		this._maxIds = {};
		this.newLeague = false;
		this._requestQueue = new Map();
		this._requestInd = 0;
		this._stopAutoFlush = false;
		this.storeInfos = {
			allStars: {
				pk: "season",
				pkType: "number",
				autoIncrement: false,
				// Current season
				getData: (tx, season) => tx.objectStore("allStars").getAll(season),
			},
			awards: {
				pk: "season",
				pkType: "number",
				autoIncrement: false,
			},
			draftLotteryResults: {
				pk: "season",
				pkType: "number",
				autoIncrement: false,
			},
			draftPicks: {
				pk: "dpid",
				pkType: "number",
				autoIncrement: true,
				getData: (tx) => tx.objectStore("draftPicks").getAll(),
				indexes: [
					{
						name: "draftPicksBySeason",
						key: ["season"],
					},
					{
						name: "draftPicksByTid",
						key: ["tid"],
					},
				],
			},
			events: {
				pk: "eid",
				pkType: "number",
				autoIncrement: true,
			},
			gameAttributes: {
				pk: "key",
				pkType: "string",
				autoIncrement: false,
				getData: (tx) => tx.objectStore("gameAttributes").getAll(),
			},
			headToHeads: {
				pk: "season",
				pkType: "number",
				autoIncrement: false,
				// Current season
				getData: (tx, season) => tx.objectStore("headToHeads").getAll(season),
			},
			messages: {
				pk: "mid",
				pkType: "number",
				autoIncrement: true,
			},
			negotiations: {
				pk: "pid",
				pkType: "number",
				autoIncrement: false,
				getData: (tx) => tx.objectStore("negotiations").getAll(),
			},
			playerFeats: {
				pk: "fid",
				pkType: "number",
				autoIncrement: true,
			},
			players: {
				pk: "pid",
				pkType: "number",
				autoIncrement: true,
				getData: async (tx) => {
					// Non-retired players
					const players1 = await tx
						.objectStore("players")
						.index("tid")
						.getAll(IDBKeyRange.lowerBound(PLAYER.UNDRAFTED));
					const players2 = await tx
						.objectStore("players")
						.index("tid")
						.getAll(PLAYER.UNDRAFTED_FANTASY_TEMP);
					return players1.concat(players2);
				},
				indexes: [
					{
						name: "playersByTid",
						key: ["tid"],
					},
					{
						name: "playersByDraftYearRetiredYear",
						key: ["draft.year", "retiredYear"],
					},
				],
			},
			playoffSeries: {
				pk: "season",
				pkType: "number",
				autoIncrement: false,
				// Current season
				getData: (tx, season) => tx.objectStore("playoffSeries").getAll(season),
			},
			releasedPlayers: {
				pk: "rid",
				pkType: "number",
				autoIncrement: true,
				getData: (tx) => tx.objectStore("releasedPlayers").getAll(),
				indexes: [
					{
						name: "releasedPlayersByTid",
						key: ["tid"],
					},
				],
			},
			savedTrades: {
				pk: "hash",
				pkType: "string",
				autoIncrement: false,
				getData: (tx) => tx.objectStore("savedTrades").getAll(),
			},
			savedTradingBlock: {
				pk: "rid",
				pkType: "number",
				autoIncrement: false,
				getData: (tx) => tx.objectStore("savedTradingBlock").getAll(),
			},
			schedule: {
				pk: "gid",
				pkType: "number",
				autoIncrement: true,
				getData: (tx) => tx.objectStore("schedule").getAll(),
			},
			scheduledEvents: {
				pk: "id",
				pkType: "number",
				autoIncrement: true,
				getData: (tx, season) => {
					return tx
						.objectStore("scheduledEvents")
						.index("season")
						.getAll(season);
				},
				getDataWithAutoSaveDisabled: true,
			},
			seasonLeaders: {
				pk: "season",
				pkType: "number",
				autoIncrement: false,
				// Get enough for any non-retired player
				getData: (tx, season) => {
					return tx
						.objectStore("seasonLeaders")
						.getAll(
							IDBKeyRange.bound(season - NUM_SEASON_LEADERS_CACHE, Infinity),
						);
				},
			},
			teamSeasons: {
				pk: "rid",
				pkType: "number",
				autoIncrement: true,
				// Past 3 seasons
				getData: (tx, season) => {
					return tx
						.objectStore("teamSeasons")
						.index("season, tid")
						.getAll(
							IDBKeyRange.bound(
								[season - NUM_PRIOR_SEASONS_TEAM_SEASONS],
								[season, ""],
							),
						);
				},
				indexes: [
					{
						name: "teamSeasonsBySeasonTid",
						key: ["season", "tid"],
						unique: true,
					},
					{
						name: "teamSeasonsByTidSeason",
						key: ["tid", "season"],
						unique: true,
					},
				],
			},
			teamStats: {
				pk: "rid",
				pkType: "number",
				autoIncrement: true,
				// Current season
				getData: (tx, season) => {
					return tx
						.objectStore("teamStats")
						.index("season, tid")
						.getAll(IDBKeyRange.bound([season], [season, ""]));
				},
				indexes: [
					{
						name: "teamStatsByPlayoffsTid",
						key: ["playoffs", "tid"],
						unique: true,
					},
				],
			},
			teams: {
				pk: "tid",
				pkType: "number",
				autoIncrement: false,
				getData: (tx: IDBPTransaction<LeagueDB>) =>
					tx.objectStore("teams").getAll(),
			},
			trade: {
				pk: "rid",
				pkType: "number",
				autoIncrement: false,
				getData: (tx: IDBPTransaction<LeagueDB>) =>
					tx.objectStore("trade").getAll(),
			},
		};

		// @ts-expect-error
		this._index2store = {};

		for (const store of helpers.keys(this.storeInfos)) {
			const indexes = this.storeInfos[store].indexes;
			if (indexes) {
				for (const index of indexes) {
					this._index2store[index.name] = store;
				}
			}
		}

		this.allStars = new StoreAPI(this, "allStars");
		this.awards = new StoreAPI(this, "awards");
		this.draftLotteryResults = new StoreAPI(this, "draftLotteryResults");
		this.draftPicks = new StoreAPI(this, "draftPicks");
		this.events = new StoreAPI(this, "events");
		this.gameAttributes = new StoreAPI(this, "gameAttributes");
		this.headToHeads = new StoreAPI(this, "headToHeads");
		this.messages = new StoreAPI(this, "messages");
		this.negotiations = new StoreAPI(this, "negotiations");
		this.playerFeats = new StoreAPI(this, "playerFeats");
		this.players = new StoreAPI(this, "players");
		this.playoffSeries = new StoreAPI(this, "playoffSeries");
		this.releasedPlayers = new StoreAPI(this, "releasedPlayers");
		this.savedTrades = new StoreAPI(this, "savedTrades");
		this.savedTradingBlock = new StoreAPI(this, "savedTradingBlock");
		this.schedule = new StoreAPI(this, "schedule");
		this.scheduledEvents = new StoreAPI(this, "scheduledEvents");
		this.seasonLeaders = new StoreAPI(this, "seasonLeaders");
		this.teamSeasons = new StoreAPI(this, "teamSeasons");
		this.teamStats = new StoreAPI(this, "teamStats");
		this.teams = new StoreAPI(this, "teams");
		this.trade = new StoreAPI(this, "trade");
	}

	_validateStatus(...validStatuses: Status[]) {
		if (!validStatuses.includes(this._status)) {
			throw new Error(`Invalid cache status "${this._status}"`);
		}
	}

	_waitForStatus(...validStatuses: Status[]): Promise<void> | void {
		if (!validStatuses.includes(this._status)) {
			return new Promise((resolve, reject) => {
				this._requestInd += 1;
				const ind = this._requestInd;

				const timeoutID = setTimeout(() => {
					reject(
						new Error(
							`Timeout while waiting for valid status (${validStatuses.join(
								"/",
							)})`,
						),
					);

					this._requestQueue.delete(ind);
				}, 30000);

				this._requestQueue.set(ind, {
					resolve,
					timeoutID,
					validStatuses,
				});
			});
		}
	}

	_setStatus(status: Status) {
		this._status = status;

		for (const [ind, entry] of this._requestQueue.entries()) {
			if (entry.validStatuses.includes(status)) {
				self.clearTimeout(entry.timeoutID);
				entry.resolve();

				this._requestQueue.delete(ind);
			}
		}
	}

	_markDirtyIndexes(store: Store, row?: any) {
		const indexes = this.storeInfos[store].indexes;
		if (!indexes || this._dirtyIndexes.has(store)) {
			return;
		}

		if (row) {
			for (const index of indexes) {
				const key = getIndexKey(index, row);

				if (!index.unique) {
					if (
						!Object.hasOwn(this._indexes[index.name], key) ||
						!this._indexes[index.name][key].includes(row)
					) {
						this._dirtyIndexes.add(store);

						break;
					}
				} else if (this._indexes[index.name][key] !== row) {
					this._dirtyIndexes.add(store);

					break;
				}
			}
		} else {
			this._dirtyIndexes.add(store);
		}
	}

	_refreshIndexes(store: Store) {
		const storeInfo = this.storeInfos[store];

		if (storeInfo.indexes) {
			for (const index of storeInfo.indexes) {
				this._indexes[index.name] = {};

				for (const row of Object.values(this._data[store])) {
					if (index.filter && !index.filter(row)) {
						continue;
					}

					const key = getIndexKey(index, row);

					if (!index.unique) {
						if (!Object.hasOwn(this._indexes[index.name], key)) {
							this._indexes[index.name][key] = [row];
						} else {
							this._indexes[index.name][key].push(row);
						}
					} else {
						this._indexes[index.name][key] = row;
					}
				}
			}

			this._dirtyIndexes.delete(store);
		}
	}

	// append is for autoSave false in rare situations
	async _loadStore(
		store: Store,
		transaction: IDBPTransaction<LeagueDB>,
		season: number,
		append: boolean,
	) {
		const storeInfo = this.storeInfos[store];
		if (!append) {
			this._deletes[store] = new Set();
			this._dirtyRecords[store] = new Set();
		}

		{
			// No getData implies no need to store any records in cache except new ones
			const data = storeInfo.getData
				? await storeInfo.getData(transaction, season)
				: [];
			if (!append) {
				this._data[store] = {};
			}

			for (const row of data) {
				const key = row[storeInfo.pk];
				this._data[store][key] = row;
			}

			this._refreshIndexes(store);
		}

		{
			if (storeInfo.autoIncrement) {
				this._maxIds[store] = -1;

				const cursor = await transaction
					.objectStore(store)
					.openCursor(undefined, "prev");
				if (cursor) {
					this._maxIds[store] = cursor.value[storeInfo.pk];
				}
			}
		}
	}

	// Load database from disk and save in cache, wiping out any prior values in cache
	async fill(season?: number) {
		this._validateStatus("empty", "full");

		this._setStatus("filling");

		let season2 = season;

		if (season2 === undefined) {
			try {
				season2 = g.get("season");
			} catch {}
		}

		if (season2 === undefined) {
			const seasonAttr = await idb.league.get("gameAttributes", "season");

			if (seasonAttr) {
				season2 = seasonAttr.value;
			}
		}

		if (season2 === undefined) {
			// Seems that gameAttributes is empty when this happens, possibly due to Chrome inappropriately deleting things?
			throw new Error(ERROR_MESSAGE_UNDEFINED_SEASON);
		}

		if (local.autoSave) {
			// @ts-expect-error
			this._data = {};
		}

		// Players are stored in SQLite (not in STORES); initialize separately.
		if (local.autoSave) {
			this._deletes["players"] = new Set();
			this._dirtyRecords["players"] = new Set();
			this._data["players"] = {};

			let lid: number | undefined;
			try {
				lid = g.get("lid") as number;
			} catch {}

			let sqlitePlayers: any[] | null = null;
			if (typeof lid === "number") {
				const count = await countSqlitePlayers(lid);
				if (count > 0) {
					sqlitePlayers = await electronReadActivePlayers(lid);
				}
			}

			if (sqlitePlayers !== null && sqlitePlayers.length > 0) {
				// Primary path: load from SQLite
				for (const player of sqlitePlayers) {
					this._data["players"][player.pid] = player;
				}
			} else {
				// Migration/fallback: load from IDB, then write to SQLite
				await this._loadStore(
					"players",
					idb.league.transaction(["players"]),
					season2,
					false,
				);
				if (typeof lid === "number") {
					const idbPlayers = Object.values(this._data["players"]);
					if (idbPlayers.length > 0) {
						await flushPlayers(lid, idbPlayers as any[], []);
					}
				}
			}

			// Seed maxId from IDB cursor (needed for new player pid assignment)
			const cursor = await idb.league
				.transaction(["players"])
				.objectStore("players")
				.openCursor(undefined, "prev");
			this._maxIds["players"] = cursor ? cursor.value.pid : -1;

			this._refreshIndexes("players");
		}

		// Teams stored in SQLite (not in STORES); initialize separately.
		if (local.autoSave) {
			this._deletes["teams"] = new Set();
			this._dirtyRecords["teams"] = new Set();
			this._data["teams"] = {};

			let lid: number | undefined;
			try {
				lid = g.get("lid") as number;
			} catch {}

			const sqliteTeamCount =
				typeof lid === "number" ? await countSqliteTeams(lid) : 0;
			if (sqliteTeamCount > 0) {
				const sqliteTeams = await electronReadAllTeams(lid!);
				if (sqliteTeams) {
					for (const team of sqliteTeams) {
						this._data["teams"][team.tid] = team;
					}
				}
			} else {
				// Migration: read all from IDB, write to SQLite
				const allIdbTeams = await idb.league
					.transaction(["teams"])
					.objectStore("teams")
					.getAll();
				for (const team of allIdbTeams) {
					this._data["teams"][team.tid] = team;
				}
				if (typeof lid === "number" && allIdbTeams.length > 0) {
					await flushTeams(lid, allIdbTeams, []);
				}
			}
			// teams.tid is not autoIncrement — no maxId needed
			this._refreshIndexes("teams");
		}

		// TeamSeasons stored in SQLite (not in STORES); initialize separately.
		if (local.autoSave) {
			this._deletes["teamSeasons"] = new Set();
			this._dirtyRecords["teamSeasons"] = new Set();
			this._data["teamSeasons"] = {};

			let lid: number | undefined;
			try {
				lid = g.get("lid") as number;
			} catch {}

			const seasonThreshold = season2 - NUM_PRIOR_SEASONS_TEAM_SEASONS;
			const sqliteTsCount =
				typeof lid === "number" ? await countSqliteTeamSeasons(lid) : 0;
			if (sqliteTsCount > 0) {
				const sqliteTeamSeasons = await electronReadTeamSeasons(lid!, {
					seasonFrom: seasonThreshold,
				});
				if (sqliteTeamSeasons) {
					for (const ts of sqliteTeamSeasons) {
						this._data["teamSeasons"][ts.rid] = ts;
					}
				}
			} else {
				// Migration: read ALL from IDB, write ALL to SQLite, load recent into cache
				const allIdbTeamSeasons = await idb.league
					.transaction(["teamSeasons"])
					.objectStore("teamSeasons")
					.getAll();
				if (typeof lid === "number" && allIdbTeamSeasons.length > 0) {
					await flushTeamSeasons(lid, allIdbTeamSeasons, []);
				}
				for (const ts of allIdbTeamSeasons) {
					if (ts.season >= seasonThreshold) {
						this._data["teamSeasons"][ts.rid] = ts;
					}
				}
			}
			// Seed maxId from the loaded records (AUTOINCREMENT → newest season has highest rid)
			this._maxIds["teamSeasons"] = Object.values(
				this._data["teamSeasons"],
			).reduce((max: number, ts: any) => Math.max(max, ts.rid ?? -1), -1);
			this._refreshIndexes("teamSeasons");
		}

		// TeamStats stored in SQLite (not in STORES); initialize separately.
		if (local.autoSave) {
			this._deletes["teamStats"] = new Set();
			this._dirtyRecords["teamStats"] = new Set();
			this._data["teamStats"] = {};

			let lid: number | undefined;
			try {
				lid = g.get("lid") as number;
			} catch {}

			const sqliteTstCount =
				typeof lid === "number" ? await countSqliteTeamStats(lid) : 0;
			if (sqliteTstCount > 0) {
				const sqliteTeamStats = await electronReadTeamStats(lid!, {
					season: season2,
				});
				if (sqliteTeamStats) {
					for (const ts of sqliteTeamStats) {
						this._data["teamStats"][ts.rid] = ts;
					}
				}
			} else {
				// Migration: read ALL from IDB, write ALL to SQLite, load current season into cache
				const allIdbTeamStats = await idb.league
					.transaction(["teamStats"])
					.objectStore("teamStats")
					.getAll();
				if (typeof lid === "number" && allIdbTeamStats.length > 0) {
					await flushTeamStats(lid, allIdbTeamStats, []);
				}
				for (const ts of allIdbTeamStats) {
					if (ts.season === season2) {
						this._data["teamStats"][ts.rid] = ts;
					}
				}
			}
			// Seed maxId from loaded records
			this._maxIds["teamStats"] = Object.values(this._data["teamStats"]).reduce(
				(max: number, ts: any) => Math.max(max, ts.rid ?? -1),
				-1,
			);
			this._refreshIndexes("teamStats");
		}

		// gameAttributes stored in SQLite; initialize separately.
		if (local.autoSave) {
			this._deletes["gameAttributes"] = new Set();
			this._dirtyRecords["gameAttributes"] = new Set();
			this._data["gameAttributes"] = {};

			let lid: number | undefined;
			try {
				lid = g.get("lid") as number;
			} catch {}

			// Check for "season" key specifically — a partial migration (e.g. only
			// "phase" was flushed) has count > 0 but is incomplete.
			const sqliteGa =
				typeof lid === "number" ? await readAllGameAttributes(lid) : null;
			const sqliteGaHasSeason =
				sqliteGa !== null && sqliteGa.some((ga) => ga.key === "season");
			if (sqliteGaHasSeason) {
				for (const ga of sqliteGa!) {
					this._data["gameAttributes"][ga.key] = ga;
				}
			} else {
				const allIdbGa = await idb.league
					.transaction(["gameAttributes"])
					.objectStore("gameAttributes")
					.getAll();
				for (const ga of allIdbGa) {
					this._data["gameAttributes"][ga.key] = ga;
				}
				if (typeof lid === "number" && allIdbGa.length > 0) {
					await flushGameAttributes(lid, allIdbGa, []);
				}
			}
			// gameAttributes has string PK, not autoIncrement — no maxId needed
		}

		// schedule stored in SQLite; initialize separately.
		if (local.autoSave) {
			this._deletes["schedule"] = new Set();
			this._dirtyRecords["schedule"] = new Set();
			this._data["schedule"] = {};

			let lid: number | undefined;
			try {
				lid = g.get("lid") as number;
			} catch {}

			const sqliteSchedCount =
				typeof lid === "number" ? await countSqliteSchedule(lid) : 0;
			if (sqliteSchedCount > 0) {
				const sqliteSched = await readAllSchedule(lid!);
				if (sqliteSched) {
					for (const sg of sqliteSched) {
						this._data["schedule"][sg.gid] = sg;
					}
				}
			} else {
				const allIdbSched = await idb.league
					.transaction(["schedule"])
					.objectStore("schedule")
					.getAll();
				for (const sg of allIdbSched) {
					this._data["schedule"][sg.gid] = sg;
				}
				if (typeof lid === "number" && allIdbSched.length > 0) {
					await flushSchedule(lid, allIdbSched, []);
				}
			}
			// Seed maxId from loaded records, then clamp to max game gid
			this._maxIds["schedule"] = Object.values(this._data["schedule"]).reduce(
				(max: number, sg: any) => Math.max(max, sg.gid ?? -1),
				-1,
			);
		}

		// draftPicks stored in SQLite; initialize separately.
		if (local.autoSave) {
			this._deletes["draftPicks"] = new Set();
			this._dirtyRecords["draftPicks"] = new Set();
			this._data["draftPicks"] = {};

			let lid: number | undefined;
			try {
				lid = g.get("lid") as number;
			} catch {}

			const sqliteDpCount =
				typeof lid === "number" ? await countSqliteDraftPicks(lid) : 0;
			if (sqliteDpCount > 0) {
				const sqliteDp = await readAllDraftPicks(lid!);
				if (sqliteDp) {
					for (const dp of sqliteDp) {
						this._data["draftPicks"][dp.dpid] = dp;
					}
				}
			} else {
				const allIdbDp = await idb.league
					.transaction(["draftPicks"])
					.objectStore("draftPicks")
					.getAll();
				for (const dp of allIdbDp) {
					this._data["draftPicks"][dp.dpid] = dp;
				}
				if (typeof lid === "number" && allIdbDp.length > 0) {
					await flushDraftPicks(lid, allIdbDp, []);
				}
			}
			this._maxIds["draftPicks"] = Object.values(
				this._data["draftPicks"],
			).reduce((max: number, dp: any) => Math.max(max, dp.dpid ?? -1), -1);
			this._refreshIndexes("draftPicks");
		}

		// negotiations stored in SQLite; initialize separately.
		if (local.autoSave) {
			this._deletes["negotiations"] = new Set();
			this._dirtyRecords["negotiations"] = new Set();
			this._data["negotiations"] = {};

			let lid: number | undefined;
			try {
				lid = g.get("lid") as number;
			} catch {}

			const sqliteNegCount =
				typeof lid === "number" ? await countSqliteNegotiations(lid) : 0;
			if (sqliteNegCount > 0) {
				const sqliteNegs = await readAllNegotiations(lid!);
				if (sqliteNegs) {
					for (const n of sqliteNegs) {
						this._data["negotiations"][n.pid] = n;
					}
				}
			} else {
				const allIdbNegs = await idb.league
					.transaction(["negotiations"])
					.objectStore("negotiations")
					.getAll();
				for (const n of allIdbNegs) {
					this._data["negotiations"][n.pid] = n;
				}
				if (typeof lid === "number" && allIdbNegs.length > 0) {
					await flushNegotiations(lid, allIdbNegs, []);
				}
			}
			// negotiations: pid is PK, not autoIncrement — no maxId needed
		}

		// releasedPlayers stored in SQLite; initialize separately.
		if (local.autoSave) {
			this._deletes["releasedPlayers"] = new Set();
			this._dirtyRecords["releasedPlayers"] = new Set();
			this._data["releasedPlayers"] = {};

			let lid: number | undefined;
			try {
				lid = g.get("lid") as number;
			} catch {}

			const sqliteRpCount =
				typeof lid === "number" ? await countSqliteReleasedPlayers(lid) : 0;
			if (sqliteRpCount > 0) {
				const sqliteRps = await readAllReleasedPlayers(lid!);
				if (sqliteRps) {
					for (const rp of sqliteRps) {
						this._data["releasedPlayers"][rp.rid] = rp;
					}
				}
			} else {
				const allIdbRps = await idb.league
					.transaction(["releasedPlayers"])
					.objectStore("releasedPlayers")
					.getAll();
				for (const rp of allIdbRps) {
					this._data["releasedPlayers"][rp.rid] = rp;
				}
				if (typeof lid === "number" && allIdbRps.length > 0) {
					await flushReleasedPlayers(lid, allIdbRps, []);
				}
			}
			this._maxIds["releasedPlayers"] = Object.values(
				this._data["releasedPlayers"],
			).reduce((max: number, rp: any) => Math.max(max, rp.rid ?? -1), -1);
			this._refreshIndexes("releasedPlayers");
		}

		// trade stored in SQLite; initialize separately.
		if (local.autoSave) {
			this._deletes["trade"] = new Set();
			this._dirtyRecords["trade"] = new Set();
			this._data["trade"] = {};

			let lid: number | undefined;
			try {
				lid = g.get("lid") as number;
			} catch {}

			const sqliteTradeCount =
				typeof lid === "number" ? await countSqliteTrade(lid) : 0;
			if (sqliteTradeCount > 0) {
				const sqliteTrades = await readAllTrade(lid!);
				if (sqliteTrades) {
					for (const t of sqliteTrades) {
						this._data["trade"][t.rid] = t;
					}
				}
			} else {
				const allIdbTrades = await idb.league
					.transaction(["trade"])
					.objectStore("trade")
					.getAll();
				for (const t of allIdbTrades) {
					this._data["trade"][t.rid] = t;
				}
				if (typeof lid === "number" && allIdbTrades.length > 0) {
					await flushTrade(lid, allIdbTrades, []);
				}
			}
			// trade.rid is always 0, not autoIncrement — no maxId needed
		}

		// savedTrades stored in SQLite; initialize separately.
		if (local.autoSave) {
			this._deletes["savedTrades"] = new Set();
			this._dirtyRecords["savedTrades"] = new Set();
			this._data["savedTrades"] = {};

			let lid: number | undefined;
			try {
				lid = g.get("lid") as number;
			} catch {}

			const sqliteStCount =
				typeof lid === "number" ? await countSqliteSavedTrades(lid) : 0;
			if (sqliteStCount > 0) {
				const sqliteSts = await readAllSavedTrades(lid!);
				if (sqliteSts) {
					for (const st of sqliteSts) {
						this._data["savedTrades"][st.hash] = st;
					}
				}
			} else {
				const allIdbSts = await idb.league
					.transaction(["savedTrades"])
					.objectStore("savedTrades")
					.getAll();
				for (const st of allIdbSts) {
					this._data["savedTrades"][st.hash] = st;
				}
				if (typeof lid === "number" && allIdbSts.length > 0) {
					await flushSavedTrades(lid, allIdbSts, []);
				}
			}
			// savedTrades has string PK (hash), not autoIncrement — no maxId needed
		}

		// savedTradingBlock stored in SQLite; initialize separately.
		if (local.autoSave) {
			this._deletes["savedTradingBlock"] = new Set();
			this._dirtyRecords["savedTradingBlock"] = new Set();
			this._data["savedTradingBlock"] = {};

			let lid: number | undefined;
			try {
				lid = g.get("lid") as number;
			} catch {}

			const sqliteStbCount =
				typeof lid === "number" ? await countSqliteSavedTradingBlock(lid) : 0;
			if (sqliteStbCount > 0) {
				const sqliteStbs = await readAllSavedTradingBlock(lid!);
				if (sqliteStbs) {
					for (const stb of sqliteStbs) {
						this._data["savedTradingBlock"][stb.rid] = stb;
					}
				}
			} else {
				const allIdbStbs = await idb.league
					.transaction(["savedTradingBlock"])
					.objectStore("savedTradingBlock")
					.getAll();
				for (const stb of allIdbStbs) {
					this._data["savedTradingBlock"][stb.rid] = stb;
				}
				if (typeof lid === "number" && allIdbStbs.length > 0) {
					await flushSavedTradingBlock(lid, allIdbStbs, []);
				}
			}
			// savedTradingBlock.rid is always 0, not autoIncrement — no maxId needed
		}

		// messages stored in SQLite; initialize empty cache but migrate IDB→SQLite if needed.
		if (local.autoSave) {
			this._deletes["messages"] = new Set();
			this._dirtyRecords["messages"] = new Set();
			this._data["messages"] = {};

			let lid: number | undefined;
			try {
				lid = g.get("lid") as number;
			} catch {}

			const sqliteMsgCount =
				typeof lid === "number" ? await countSqliteMessages(lid) : 0;
			if (sqliteMsgCount === 0 && typeof lid === "number") {
				const allIdbMsgs = await idb.league
					.transaction(["messages"])
					.objectStore("messages")
					.getAll();
				if (allIdbMsgs.length > 0) {
					await flushMessages(lid, allIdbMsgs, []);
				}
			}
			// Seed maxId from SQLite (messages not preloaded into cache)
			this._maxIds["messages"] =
				typeof lid === "number" ? await getMaxMessageMid(lid) : -1;
		}

		// allStars stored in SQLite; preload current season into cache.
		if (local.autoSave) {
			this._deletes["allStars"] = new Set();
			this._dirtyRecords["allStars"] = new Set();
			this._data["allStars"] = {};

			let lid: number | undefined;
			try {
				lid = g.get("lid") as number;
			} catch {}

			const sqliteAsCount =
				typeof lid === "number" ? await countSqliteAllStars(lid) : 0;
			if (sqliteAsCount > 0) {
				const rows = await electronReadAllStars(lid!, { season: season2 });
				if (rows) {
					for (const r of rows) this._data["allStars"][r.season] = r;
				}
			} else {
				const allIdb = await idb.league
					.transaction(["allStars"])
					.objectStore("allStars")
					.getAll();
				if (typeof lid === "number" && allIdb.length > 0) {
					await flushAllStars(lid, allIdb, []);
				}
				for (const r of allIdb) {
					if (r.season === season2) this._data["allStars"][r.season] = r;
				}
			}
			// season PK, not autoIncrement — no maxId needed
		}

		// awards stored in SQLite; not preloaded into cache.
		if (local.autoSave) {
			this._deletes["awards"] = new Set();
			this._dirtyRecords["awards"] = new Set();
			this._data["awards"] = {};

			let lid: number | undefined;
			try {
				lid = g.get("lid") as number;
			} catch {}

			const sqliteAwCount =
				typeof lid === "number" ? await countSqliteAwards(lid) : 0;
			if (sqliteAwCount === 0 && typeof lid === "number") {
				const allIdb = await idb.league
					.transaction(["awards"])
					.objectStore("awards")
					.getAll();
				if (allIdb.length > 0) await flushAwards(lid, allIdb, []);
			}
			// awards not preloaded; season PK, no maxId needed
		}

		// draftLotteryResults stored in SQLite; not preloaded into cache.
		if (local.autoSave) {
			this._deletes["draftLotteryResults"] = new Set();
			this._dirtyRecords["draftLotteryResults"] = new Set();
			this._data["draftLotteryResults"] = {};

			let lid: number | undefined;
			try {
				lid = g.get("lid") as number;
			} catch {}

			const sqliteDlrCount =
				typeof lid === "number" ? await countSqliteDraftLotteryResults(lid) : 0;
			if (sqliteDlrCount === 0 && typeof lid === "number") {
				const allIdb = await idb.league
					.transaction(["draftLotteryResults"])
					.objectStore("draftLotteryResults")
					.getAll();
				if (allIdb.length > 0) await flushDraftLotteryResults(lid, allIdb, []);
			}
			// not preloaded; season PK, no maxId needed
		}

		// events stored in SQLite; not preloaded into cache. Seed maxId from SQLite.
		if (local.autoSave) {
			this._deletes["events"] = new Set();
			this._dirtyRecords["events"] = new Set();
			this._data["events"] = {};

			let lid: number | undefined;
			try {
				lid = g.get("lid") as number;
			} catch {}

			const sqliteEvCount =
				typeof lid === "number" ? await countSqliteEvents(lid) : 0;
			if (sqliteEvCount === 0 && typeof lid === "number") {
				const allIdb = await idb.league
					.transaction(["events"])
					.objectStore("events")
					.getAll();
				if (allIdb.length > 0) await flushEvents(lid, allIdb, []);
			}
			this._maxIds["events"] =
				typeof lid === "number" ? await getMaxEventEid(lid) : -1;
		}

		// headToHeads stored in SQLite; preload current season into cache.
		if (local.autoSave) {
			this._deletes["headToHeads"] = new Set();
			this._dirtyRecords["headToHeads"] = new Set();
			this._data["headToHeads"] = {};

			let lid: number | undefined;
			try {
				lid = g.get("lid") as number;
			} catch {}

			const sqliteH2hCount =
				typeof lid === "number" ? await countSqliteHeadToHeads(lid) : 0;
			if (sqliteH2hCount > 0) {
				const rows = await electronReadHeadToHeads(lid!, { season: season2 });
				if (rows) {
					for (const r of rows) this._data["headToHeads"][r.season] = r;
				}
			} else {
				const allIdb = await idb.league
					.transaction(["headToHeads"])
					.objectStore("headToHeads")
					.getAll();
				if (typeof lid === "number" && allIdb.length > 0) {
					await flushHeadToHeads(lid, allIdb, []);
				}
				for (const r of allIdb) {
					if (r.season === season2) this._data["headToHeads"][r.season] = r;
				}
			}
			// season PK, not autoIncrement — no maxId needed
		}

		// playerFeats stored in SQLite; not preloaded into cache. Seed maxId from SQLite.
		if (local.autoSave) {
			this._deletes["playerFeats"] = new Set();
			this._dirtyRecords["playerFeats"] = new Set();
			this._data["playerFeats"] = {};

			let lid: number | undefined;
			try {
				lid = g.get("lid") as number;
			} catch {}

			const sqlitePfCount =
				typeof lid === "number" ? await countSqlitePlayerFeats(lid) : 0;
			if (sqlitePfCount === 0 && typeof lid === "number") {
				const allIdb = await idb.league
					.transaction(["playerFeats"])
					.objectStore("playerFeats")
					.getAll();
				if (allIdb.length > 0) await flushPlayerFeats(lid, allIdb, []);
			}
			this._maxIds["playerFeats"] =
				typeof lid === "number" ? await getMaxPlayerFeatFid(lid) : -1;
		}

		// playoffSeries stored in SQLite; preload current season into cache.
		if (local.autoSave) {
			this._deletes["playoffSeries"] = new Set();
			this._dirtyRecords["playoffSeries"] = new Set();
			this._data["playoffSeries"] = {};

			let lid: number | undefined;
			try {
				lid = g.get("lid") as number;
			} catch {}

			const sqlitePsCount =
				typeof lid === "number" ? await countSqlitePlayoffSeries(lid) : 0;
			if (sqlitePsCount > 0) {
				const rows = await electronReadAllPlayoffSeries(lid!);
				if (rows) {
					for (const r of rows) {
						if (r.season === season2) this._data["playoffSeries"][r.season] = r;
					}
				}
			} else {
				const allIdb = await idb.league
					.transaction(["playoffSeries"])
					.objectStore("playoffSeries")
					.getAll();
				if (typeof lid === "number" && allIdb.length > 0) {
					await flushPlayoffSeries(lid, allIdb, []);
				}
				for (const r of allIdb) {
					if (r.season === season2) this._data["playoffSeries"][r.season] = r;
				}
			}
			// season PK, not autoIncrement — no maxId needed
		}

		// scheduledEvents stored in SQLite; preload current season into cache.
		if (local.autoSave) {
			this._deletes["scheduledEvents"] = new Set();
			this._dirtyRecords["scheduledEvents"] = new Set();
			this._data["scheduledEvents"] = {};

			let lid: number | undefined;
			try {
				lid = g.get("lid") as number;
			} catch {}

			const sqliteSeCount =
				typeof lid === "number" ? await countSqliteScheduledEvents(lid) : 0;
			if (sqliteSeCount > 0) {
				const rows = await electronReadScheduledEvents(lid!, {
					season: season2,
				});
				if (rows) {
					for (const r of rows) this._data["scheduledEvents"][r.id] = r;
				}
			} else {
				const allIdb = await idb.league
					.transaction(["scheduledEvents"])
					.objectStore("scheduledEvents")
					.getAll();
				if (typeof lid === "number" && allIdb.length > 0) {
					await flushScheduledEvents(lid, allIdb, []);
				}
				for (const r of allIdb) {
					if (r.season === season2) this._data["scheduledEvents"][r.id] = r;
				}
			}
			this._maxIds["scheduledEvents"] =
				typeof lid === "number" ? await getMaxScheduledEventId(lid) : -1;
		}

		// seasonLeaders stored in SQLite; preload last NUM_SEASON_LEADERS_CACHE seasons.
		if (local.autoSave) {
			this._deletes["seasonLeaders"] = new Set();
			this._dirtyRecords["seasonLeaders"] = new Set();
			this._data["seasonLeaders"] = {};

			let lid: number | undefined;
			try {
				lid = g.get("lid") as number;
			} catch {}

			const fromSeason = season2 - NUM_SEASON_LEADERS_CACHE;
			const sqliteSlCount =
				typeof lid === "number" ? await countSqliteSeasonLeaders(lid) : 0;
			if (sqliteSlCount > 0) {
				const rows = await electronReadSeasonLeaders(lid!, { fromSeason });
				if (rows) {
					for (const r of rows) this._data["seasonLeaders"][r.season] = r;
				}
			} else {
				const allIdb = await idb.league
					.transaction(["seasonLeaders"])
					.objectStore("seasonLeaders")
					.getAll();
				if (typeof lid === "number" && allIdb.length > 0) {
					await flushSeasonLeaders(lid, allIdb, []);
				}
				for (const r of allIdb) {
					if (r.season >= fromSeason) this._data["seasonLeaders"][r.season] = r;
				}
			}
			// season PK, not autoIncrement — no maxId needed
		}

		for (const store of STORES) {
			if (local.autoSave) {
				await this._loadStore(
					store,
					idb.league.transaction([store]),
					season2,
					false,
				);
			} else if (this.storeInfos[store].getDataWithAutoSaveDisabled) {
				await this._loadStore(
					store,
					idb.league.transaction([store]),
					season2,
					true,
				);
			}
		}

		if (local.autoSave) {
			this._dirty = false;
		}

		// Seed schedule maxId from SQLite so new schedule gids never collide with
		// existing game gids (replaces the old in-memory games-store HACK).
		if (Object.hasOwn(this._maxIds, "schedule")) {
			let lid: number | undefined;
			try {
				lid = g.get("lid") as number;
			} catch {}
			if (typeof lid === "number") {
				const maxGameGid = (await getMaxGameGid(lid)) ?? -1;
				if (this._maxIds.schedule < maxGameGid) {
					this._maxIds.schedule = maxGameGid;
				}
			}
		}

		this._setStatus("full");
	}

	// Take current contents in database and write to disk
	async flush(storesToCheck = STORES) {
		if (!local.autoSave) {
			return;
		}

		this._validateStatus("full");

		// Only open transaction on stores with dirty records - code below does nothing unless this._deletes or this._dirtyRecords has something in it
		let stores = storesToCheck.filter(
			(store) =>
				this._deletes[store].size > 0 || this._dirtyRecords[store].size > 0,
		);

		// Flush players to SQLite instead of IDB (players is not in STORES)
		const hasPlayerChanges =
			(this._dirtyRecords["players"]?.size ?? 0) > 0 ||
			(this._deletes["players"]?.size ?? 0) > 0;
		if (hasPlayerChanges) {
			let lid: number | undefined;
			try {
				lid = g.get("lid") as number;
			} catch {}
			if (typeof lid === "number") {
				const deletePids = [...this._deletes["players"]] as number[];
				const dirtyPlayers: any[] = [];
				for (const id of this._dirtyRecords["players"]) {
					const record = this._data["players"][id];
					if (record !== undefined) dirtyPlayers.push(record);
				}
				this._deletes["players"].clear();
				this._dirtyRecords["players"].clear();
				await flushPlayers(lid, dirtyPlayers, deletePids);
			}
			stores = stores.filter((s) => s !== "players");
		}

		// Flush teams to SQLite
		const hasTeamChanges =
			(this._dirtyRecords["teams"]?.size ?? 0) > 0 ||
			(this._deletes["teams"]?.size ?? 0) > 0;
		if (hasTeamChanges) {
			let lid: number | undefined;
			try {
				lid = g.get("lid") as number;
			} catch {}
			if (typeof lid === "number") {
				const deleteTids = [...this._deletes["teams"]] as number[];
				const dirtyTeams: any[] = [];
				for (const id of this._dirtyRecords["teams"]) {
					const record = this._data["teams"][id];
					if (record !== undefined) dirtyTeams.push(record);
				}
				this._deletes["teams"].clear();
				this._dirtyRecords["teams"].clear();
				await flushTeams(lid, dirtyTeams, deleteTids);
			}
		}

		// Flush teamSeasons to SQLite
		const hasTeamSeasonChanges =
			(this._dirtyRecords["teamSeasons"]?.size ?? 0) > 0 ||
			(this._deletes["teamSeasons"]?.size ?? 0) > 0;
		if (hasTeamSeasonChanges) {
			let lid: number | undefined;
			try {
				lid = g.get("lid") as number;
			} catch {}
			if (typeof lid === "number") {
				const deleteRids = [...this._deletes["teamSeasons"]] as number[];
				const dirtyTeamSeasons: any[] = [];
				for (const id of this._dirtyRecords["teamSeasons"]) {
					const record = this._data["teamSeasons"][id];
					if (record !== undefined) dirtyTeamSeasons.push(record);
				}
				this._deletes["teamSeasons"].clear();
				this._dirtyRecords["teamSeasons"].clear();
				await flushTeamSeasons(lid, dirtyTeamSeasons, deleteRids);
			}
		}

		// Flush teamStats to SQLite
		const hasTeamStatsChanges =
			(this._dirtyRecords["teamStats"]?.size ?? 0) > 0 ||
			(this._deletes["teamStats"]?.size ?? 0) > 0;
		if (hasTeamStatsChanges) {
			let lid: number | undefined;
			try {
				lid = g.get("lid") as number;
			} catch {}
			if (typeof lid === "number") {
				const deleteRids = [...this._deletes["teamStats"]] as number[];
				const dirtyTeamStats: any[] = [];
				for (const id of this._dirtyRecords["teamStats"]) {
					const record = this._data["teamStats"][id];
					if (record !== undefined) dirtyTeamStats.push(record);
				}
				this._deletes["teamStats"].clear();
				this._dirtyRecords["teamStats"].clear();
				await flushTeamStats(lid, dirtyTeamStats, deleteRids);
			}
		}

		// Helper to flush any SQLite-managed store with numeric IDs
		const flushSqliteStore = async <T>(
			store: Store,
			flushFn: (lid: number, dirty: T[], deletes: any[]) => Promise<void>,
		) => {
			const hasChanges =
				(this._dirtyRecords[store]?.size ?? 0) > 0 ||
				(this._deletes[store]?.size ?? 0) > 0;
			if (!hasChanges) return;
			let lid: number | undefined;
			try {
				lid = g.get("lid") as number;
			} catch {}
			if (typeof lid !== "number") return;
			const deletes = [...this._deletes[store]] as any[];
			const dirty: T[] = [];
			for (const id of this._dirtyRecords[store]) {
				const record = this._data[store][id];
				if (record !== undefined) dirty.push(record);
			}
			this._deletes[store].clear();
			this._dirtyRecords[store].clear();
			await flushFn(lid, dirty, deletes);
		};

		await flushSqliteStore("gameAttributes", flushGameAttributes);
		await flushSqliteStore("schedule", flushSchedule);
		await flushSqliteStore("draftPicks", flushDraftPicks);
		await flushSqliteStore("negotiations", flushNegotiations);
		await flushSqliteStore("releasedPlayers", flushReleasedPlayers);
		await flushSqliteStore("trade", flushTrade);
		await flushSqliteStore("savedTrades", flushSavedTrades);
		await flushSqliteStore("savedTradingBlock", flushSavedTradingBlock);
		await flushSqliteStore("messages", flushMessages);
		await flushSqliteStore("allStars", flushAllStars);
		await flushSqliteStore("awards", flushAwards);
		await flushSqliteStore("draftLotteryResults", flushDraftLotteryResults);
		await flushSqliteStore("events", flushEvents);
		await flushSqliteStore("headToHeads", flushHeadToHeads);
		await flushSqliteStore("playerFeats", flushPlayerFeats);
		await flushSqliteStore("playoffSeries", flushPlayoffSeries);
		await flushSqliteStore("scheduledEvents", flushScheduledEvents);
		await flushSqliteStore("seasonLeaders", flushSeasonLeaders);

		if (stores.length === 0) {
			// Not sure if this is needed - prior to this short circuit, if this._dirty was somehow true it would have been set false at the bottom of this function. So put it here just in case.
			this._dirty = false;

			// Skip making any transaction if possible
			return;
		}

		const transaction = idb.league.transaction(stores, "readwrite");

		for (const store of stores) {
			for (const id of this._deletes[store]) {
				// This is synchronous to prevent any race condition
				transaction.objectStore(store).delete(id);
			}

			this._deletes[store].clear();

			for (const id of this._dirtyRecords[store]) {
				const record = this._data[store][id];

				// If record was deleted after being marked as dirty, it will be undefined here
				if (record !== undefined) {
					// This is synchronous to prevent any race condition
					transaction.objectStore(store).put(record);
				}
			}

			this._dirtyRecords[store].clear();
		}

		await transaction.done;

		if (this._dirty) {
			this._dirty = false;

			// Update lastPlayed
			await league.updateMeta({
				lastPlayed: new Date(),
			});
		}
	}

	async _autoFlush() {
		if (this._stopAutoFlush) {
			return;
		}

		// Only flush if cache is dirty and nothing is going on
		if (this._dirty) {
			const skipFlush =
				lock.get("gameSim") || lock.get("newPhase") || !!local.autoPlayUntil;

			if (!skipFlush) {
				await this.flush();
			}
		}

		setTimeout(() => {
			this._autoFlush();
		}, AUTO_FLUSH_INTERVAL);
	}

	startAutoFlush() {
		this._stopAutoFlush = false;
		setTimeout(() => {
			this._autoFlush();
		}, AUTO_FLUSH_INTERVAL);
	}

	stopAutoFlush() {
		this._stopAutoFlush = true;
	}

	async _get(store: Store, id: number | string): Promise<any> {
		await this._waitForStatus("full");
		return this._data[store][id];
	}

	async _getAll(store: Store): Promise<any[]> {
		await this._waitForStatus("full");
		return Object.values(this._data[store]);
	}

	_checkIndexFreshness(index: Index) {
		const store = this._index2store[index];

		if (this._dirtyIndexes.has(store)) {
			this._refreshIndexes(store);
		}
	}

	async _indexGet(
		index: Index,
		key: number | string | (number | string | boolean)[],
	): Promise<any> {
		await this._waitForStatus("full");

		this._checkIndexFreshness(index);

		// Array keys are special, because they need to be stored in a JS object and then recovered
		const actualKey = Array.isArray(key) ? stringifyInfinity(key) : key;
		const val = this._indexes[index][actualKey];

		if (Array.isArray(val)) {
			return val[0];
		}

		return val;
	}

	// Key is kind of like IDB key range, except there is no "only" support for compound keys so in that case you have to query like [[2018, 1], [2018, 1]] instead of [2018, 1], otherwise it can't tell if it's an "only" compound key or a min/max range for a numeric key
	async _indexGetAll(
		index: Index,
		key: number | string | [any, any] | any[],
	): Promise<any[]> {
		await this._waitForStatus("full");

		this._checkIndexFreshness(index);

		if (typeof key === "number" || typeof key === "string") {
			if (Object.hasOwn(this._indexes[index], key)) {
				const val = this._indexes[index][key];

				if (!Array.isArray(val)) {
					return [val];
				}

				return val;
			}

			return [];
		}

		const [min, max] = key;
		let output: any[] = [];

		for (const keyString of Object.keys(this._indexes[index])) {
			let keyParsed;

			// Array keys are special, because they need to be stored in a JS object and then recovered
			if (Array.isArray(min)) {
				keyParsed = parseInfinity(keyString);
			} else if (typeof min === "number") {
				keyParsed = helpers.localeParseFloat(keyString);

				if (Number.isNaN(keyParsed)) {
					throw new Error(
						`Was expecting numeric key for index "${index}" but got "${keyString}"`,
					);
				}
			} else {
				keyParsed = keyString;
			}

			if (cmp(keyParsed, min) >= 0 && cmp(keyParsed, max) <= 0) {
				output = output.concat(this._indexes[index][keyString]);
			}
		}

		return output;
	}

	async _storeObj(
		type: "add" | "put",
		store: Store,
		obj: any,
	): Promise<number | string> {
		await this._waitForStatus("full");
		const pk = this.storeInfos[store].pk;

		if (Object.hasOwn(obj, pk)) {
			if (type === "add" && this._data[store][obj[pk]]) {
				throw new Error(
					`Primary key "${obj[pk]}" already exists in "${store}"`,
				);
			}

			if (Object.hasOwn(this._maxIds, store) && obj[pk] > this._maxIds[store]) {
				this._maxIds[store] = obj[pk];
			}
		} else {
			if (!this.storeInfos[store].autoIncrement) {
				throw new Error(
					`Primary key field "${pk}" is required for non-autoincrementing store "${store}"`,
				);
			}

			this._maxIds[store] += 1;
			obj[pk] = this._maxIds[store];
		}

		this._data[store][obj[pk]] = obj;

		// Need to have the correct type here for IndexedDB
		const idParsed =
			this.storeInfos[store].pkType === "number"
				? Number.parseInt(obj[pk])
				: obj[pk];

		this._dirtyRecords[store].add(idParsed);

		this._dirty = true;

		this._markDirtyIndexes(store, obj);

		return obj[pk];
	}

	_add(store: Store, obj: any): Promise<number | string> {
		return this._storeObj("add", store, obj);
	}

	_put(store: Store, obj: any): Promise<number | string> {
		return this._storeObj("put", store, obj);
	}

	async _delete(store: Store, id: number | string) {
		await this._waitForStatus("full");

		if (Object.hasOwn(this._data[store], id)) {
			delete this._data[store][id];
		}

		// Need to have the correct type here for IndexedDB
		const idParsed =
			this.storeInfos[store].pkType === "number" && typeof id === "string"
				? Number.parseInt(id)
				: id;

		this._deletes[store].add(idParsed);

		this._dirty = true;

		this._markDirtyIndexes(store);
	}

	async _clear(store: Store) {
		await this._waitForStatus("full");

		for (const id of Object.keys(this._data[store])) {
			delete this._data[store][id];

			// Need to have the correct type here for IndexedDB
			const idParsed =
				this.storeInfos[store].pkType === "number" ? Number.parseInt(id) : id;

			this._deletes[store].add(idParsed);
		}

		this._dirty = true;

		this._markDirtyIndexes(store);
	}
}

export default Cache;
