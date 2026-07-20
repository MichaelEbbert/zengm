import { app, BrowserWindow } from "electron";
import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import {
	openDb,
	writeGame,
	readGames,
	getMaxGid,
	writePlayers,
	readActivePlayers,
	readPlayersFilter,
	countPlayers,
	writeTeams,
	readAllTeams,
	countTeams,
	writeTeamSeasons,
	readTeamSeasons,
	countTeamSeasons,
	writeTeamStats,
	readTeamStats,
	countTeamStats,
	writeGameAttributes,
	readGameAttributes,
	countGameAttributes,
	writeSchedule,
	readSchedule,
	countSchedule,
	maxScheduleGid,
	writeDraftPicks,
	readDraftPicks,
	countDraftPicks,
	writeNegotiations,
	readNegotiations,
	countNegotiations,
	writeReleasedPlayers,
	readReleasedPlayers,
	countReleasedPlayers,
	writeTrade,
	readTrade,
	countTrade,
	writeSavedTrades,
	readSavedTrades,
	countSavedTrades,
	writeSavedTradingBlock,
	readSavedTradingBlock,
	countSavedTradingBlock,
	writeMessages,
	readMessages,
	countMessages,
	maxMessageMid,
	writeAllStars,
	readAllStars,
	countAllStars,
	writeAwards,
	readAwards,
	countAwards,
	writeDraftLotteryResults,
	readDraftLotteryResults,
	countDraftLotteryResults,
	writeEvents,
	readEvents,
	countEvents,
	maxEventEid,
	writeHeadToHeads,
	readHeadToHeads,
	countHeadToHeads,
	writePlayerFeats,
	readPlayerFeats,
	countPlayerFeats,
	maxPlayerFeatFid,
	writePlayoffSeries,
	readPlayoffSeries,
	countPlayoffSeries,
	writeScheduledEvents,
	readScheduledEvents,
	countScheduledEvents,
	maxScheduledEventId,
	writeSeasonLeaders,
	readSeasonLeaders,
	countSeasonLeaders,
	openMetaDb,
	getAllLeagues,
	getLeague,
	putLeague,
	deleteLeague,
	deleteLeagueDb,
	clearLeagues,
	getMaxLeagueLid,
	getAttribute,
	putAttribute,
	deleteAttribute,
	getAllAchievements,
	addAchievements,
	clearAchievements,
	getMaxPlayerPid,
	cloneLeague,
	deleteOldData,
} from "./sqlite.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Dev server port — matches getPort({ port: 3000 }) default in tools/lib/server.ts.
// Override with ELECTRON_DEV_PORT if the server landed on a different port.
const devPort = process.env.ELECTRON_DEV_PORT ?? "3000";
const DEV_URL = `http://localhost:${devPort}`;

// Local HTTP API server port. Override with ELECTRON_API_PORT if needed.
const apiPort = Number(process.env.ELECTRON_API_PORT ?? "3001");

// Call a ZenGM worker function via window.bbgm.toWorker(), which is exposed
// globally in src/ui/index.tsx. executeJavaScript awaits the returned Promise.
function callWorker(win, type, name, param) {
	const paramStr = JSON.stringify(param ?? null);
	return win.webContents.executeJavaScript(
		`window.bbgm.toWorker(${JSON.stringify(type)}, ${JSON.stringify(name)}, ${paramStr})`,
	);
}

// Simple HTTP router: returns a handler if the method+path match a route.
const PLAY_MENU_ROUTES = {
	"POST /sim/day": ["playMenu", "day"],
	"POST /sim/week": ["playMenu", "week"],
	"POST /sim/month": ["playMenu", "month"],
	"POST /sim/untilPlayoffs": ["playMenu", "untilPlayoffs"],
	"POST /sim/throughPlayoffs": ["playMenu", "throughPlayoffs"],
	"POST /sim/untilDraft": ["playMenu", "untilDraft"],
	"POST /sim/untilResignPlayers": ["playMenu", "untilResignPlayers"],
	"POST /sim/untilFreeAgency": ["playMenu", "untilFreeAgency"],
	"POST /sim/untilPreseason": ["playMenu", "untilPreseason"],
	"POST /sim/untilRegularSeason": ["playMenu", "untilRegularSeason"],
	"POST /draft/onePick": ["playMenu", "onePick"],
	"POST /draft/untilEnd": ["playMenu", "untilEnd"],
};

function startApiServer(win) {
	const server = http.createServer(async (req, res) => {
		const url = new URL(req.url, `http://127.0.0.1:${apiPort}`);
		const key = `${req.method?.toUpperCase()} ${url.pathname}`;

		const send = (status, body) => {
			res.writeHead(status, {
				"Content-Type": "application/json",
				"Access-Control-Allow-Origin": "*",
			});
			res.end(JSON.stringify(body));
		};

		if (req.method === "OPTIONS") {
			res.writeHead(204, {
				"Access-Control-Allow-Origin": "*",
				"Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
				"Access-Control-Allow-Headers": "Content-Type",
			});
			res.end();
			return;
		}

		try {
			if (PLAY_MENU_ROUTES[key]) {
				const [type, name] = PLAY_MENU_ROUTES[key];
				const result = await callWorker(win, type, name, undefined);
				send(200, { ok: true, result: result ?? null });
				return;
			}

			if (key === "GET /status") {
				const status = await callWorker(
					win,
					"main",
					"getLeagueStatus",
					undefined,
				);
				send(200, status);
				return;
			}

			if (key === "POST /draft/pick") {
				// Body: { pid: number }
				let body = "";
				req.on("data", (chunk) => (body += chunk));
				await new Promise((resolve) => req.on("end", resolve));
				const { pid } = JSON.parse(body || "{}");
				if (typeof pid !== "number") {
					send(400, { error: "pid (number) required" });
					return;
				}
				const result = await callWorker(win, "main", "draftUser", pid);
				send(200, { ok: true, result: result ?? null });
				return;
			}

			if (key === "GET /config") {
				send(200, { dbDir: process.env.ZENGM_DB_DIR || null });
				return;
			}

			if (key === "GET /query") {
				send(501, { error: "SQL query not available until Phase 2 (SQLite)" });
				return;
			}

			if (key === "POST /game") {
				let body = "";
				req.on("data", (chunk) => (body += chunk));
				await new Promise((resolve) => req.on("end", resolve));
				const { lid, gameStats } = JSON.parse(body);
				const db = openDb(process.env.ZENGM_DB_DIR, lid);
				try {
					writeGame(db, gameStats);
					console.log(
						`[writeGame] ok gid=${gameStats?.gid} season=${gameStats?.season}`,
					);
				} catch (writeErr) {
					console.error(`[writeGame] FAILED gid=${gameStats?.gid}:`, writeErr);
					send(500, { error: String(writeErr) });
					return;
				}
				send(200, { ok: true });
				return;
			}

			if (key === "GET /games" || key === "GET /games/maxgid") {
				const url2 = new URL(req.url, `http://127.0.0.1:${apiPort}`);
				const lid = Number(url2.searchParams.get("lid"));
				if (!lid) {
					send(400, { error: "lid required" });
					return;
				}
				const db = openDb(process.env.ZENGM_DB_DIR, lid);
				if (url2.pathname === "/games/maxgid") {
					send(200, { maxGid: getMaxGid(db) });
					return;
				}
				const filter = {};
				if (url2.searchParams.has("gid"))
					filter.gid = Number(url2.searchParams.get("gid"));
				if (url2.searchParams.has("season"))
					filter.season = Number(url2.searchParams.get("season"));
				send(200, readGames(db, filter));
				return;
			}

			if (key === "POST /players/flush") {
				let body = "";
				req.on("data", (chunk) => (body += chunk));
				await new Promise((resolve) => req.on("end", resolve));
				const { lid, players, deletePids } = JSON.parse(body);
				const db = openDb(process.env.ZENGM_DB_DIR, lid);
				writePlayers(db, players, deletePids ?? []);
				send(200, { ok: true });
				return;
			}

			if (key === "GET /players") {
				const url2 = new URL(req.url, `http://127.0.0.1:${apiPort}`);
				const lid = Number(url2.searchParams.get("lid"));
				if (!lid) {
					send(400, { error: "lid required" });
					return;
				}
				const db = openDb(process.env.ZENGM_DB_DIR, lid);
				const mode = url2.searchParams.get("mode");
				if (mode === "active") {
					send(200, { players: readActivePlayers(db) });
					return;
				}
				if (mode === "count") {
					send(200, { count: countPlayers(db) });
					return;
				}
				if (mode === "maxpid") {
					send(200, { maxPid: getMaxPlayerPid(db) });
					return;
				}
				const filter = {};
				if (url2.searchParams.has("pid"))
					filter.pid = Number(url2.searchParams.get("pid"));
				else if (url2.searchParams.has("pids"))
					filter.pids = url2.searchParams.get("pids").split(",").map(Number);
				else if (url2.searchParams.has("tid"))
					filter.tid = Number(url2.searchParams.get("tid"));
				else if (url2.searchParams.has("retiredYear"))
					filter.retiredYear = Number(url2.searchParams.get("retiredYear"));
				else if (url2.searchParams.has("draftYear"))
					filter.draftYear = Number(url2.searchParams.get("draftYear"));
				else if (url2.searchParams.has("statsTid"))
					filter.statsTid = Number(url2.searchParams.get("statsTid"));
				else if (url2.searchParams.get("hof") === "1") filter.hof = true;
				else if (url2.searchParams.get("note") === "1") filter.note = true;
				else if (url2.searchParams.get("watch") === "1") filter.watch = true;
				else if (url2.searchParams.get("activeAndRetired") === "1")
					filter.activeAndRetired = true;
				else if (url2.searchParams.has("activeSeason"))
					filter.activeSeason = Number(url2.searchParams.get("activeSeason"));
				send(200, { players: readPlayersFilter(db, filter) });
				return;
			}

			if (key === "POST /teams/flush") {
				let body = "";
				req.on("data", (chunk) => (body += chunk));
				await new Promise((resolve) => req.on("end", resolve));
				const { lid, teams, deleteTids } = JSON.parse(body);
				const db = openDb(process.env.ZENGM_DB_DIR, lid);
				writeTeams(db, teams, deleteTids ?? []);
				send(200, { ok: true });
				return;
			}

			if (key === "GET /teams") {
				const url2 = new URL(req.url, `http://127.0.0.1:${apiPort}`);
				const lid = Number(url2.searchParams.get("lid"));
				if (!lid) {
					send(400, { error: "lid required" });
					return;
				}
				const db = openDb(process.env.ZENGM_DB_DIR, lid);
				if (url2.searchParams.get("mode") === "count") {
					send(200, { count: countTeams(db) });
					return;
				}
				send(200, { teams: readAllTeams(db) });
				return;
			}

			if (key === "POST /team-seasons/flush") {
				let body = "";
				req.on("data", (chunk) => (body += chunk));
				await new Promise((resolve) => req.on("end", resolve));
				const { lid, teamSeasons, deleteRids } = JSON.parse(body);
				const db = openDb(process.env.ZENGM_DB_DIR, lid);
				writeTeamSeasons(db, teamSeasons, deleteRids ?? []);
				send(200, { ok: true });
				return;
			}

			if (key === "GET /team-seasons") {
				const url2 = new URL(req.url, `http://127.0.0.1:${apiPort}`);
				const lid = Number(url2.searchParams.get("lid"));
				if (!lid) {
					send(400, { error: "lid required" });
					return;
				}
				const db = openDb(process.env.ZENGM_DB_DIR, lid);
				if (url2.searchParams.get("mode") === "count") {
					send(200, { count: countTeamSeasons(db) });
					return;
				}
				const filter = {};
				if (url2.searchParams.get("note") === "1") filter.note = true;
				else if (
					url2.searchParams.has("tid") &&
					url2.searchParams.has("season")
				) {
					filter.tid = Number(url2.searchParams.get("tid"));
					filter.season = Number(url2.searchParams.get("season"));
				} else if (
					url2.searchParams.has("tid") &&
					url2.searchParams.has("seasonFrom")
				) {
					filter.tid = Number(url2.searchParams.get("tid"));
					filter.seasonFrom = Number(url2.searchParams.get("seasonFrom"));
					if (url2.searchParams.has("seasonTo"))
						filter.seasonTo = Number(url2.searchParams.get("seasonTo"));
				} else if (url2.searchParams.has("tid")) {
					filter.tid = Number(url2.searchParams.get("tid"));
				} else if (url2.searchParams.has("season")) {
					filter.season = Number(url2.searchParams.get("season"));
				} else if (url2.searchParams.has("seasonFrom")) {
					filter.seasonFrom = Number(url2.searchParams.get("seasonFrom"));
				}
				send(200, { teamSeasons: readTeamSeasons(db, filter) });
				return;
			}

			if (key === "POST /team-stats/flush") {
				let body = "";
				req.on("data", (chunk) => (body += chunk));
				await new Promise((resolve) => req.on("end", resolve));
				const { lid, teamStats, deleteRids } = JSON.parse(body);
				const db = openDb(process.env.ZENGM_DB_DIR, lid);
				writeTeamStats(db, teamStats, deleteRids ?? []);
				send(200, { ok: true });
				return;
			}

			if (key === "GET /team-stats") {
				const url2 = new URL(req.url, `http://127.0.0.1:${apiPort}`);
				const lid = Number(url2.searchParams.get("lid"));
				if (!lid) {
					send(400, { error: "lid required" });
					return;
				}
				const db = openDb(process.env.ZENGM_DB_DIR, lid);
				if (url2.searchParams.get("mode") === "count") {
					send(200, { count: countTeamStats(db) });
					return;
				}
				const filter = {};
				if (url2.searchParams.has("season"))
					filter.season = Number(url2.searchParams.get("season"));
				if (url2.searchParams.has("tid"))
					filter.tid = Number(url2.searchParams.get("tid"));
				send(200, { teamStats: readTeamStats(db, filter) });
				return;
			}

			if (key === "POST /game-attributes/flush") {
				let body = "";
				req.on("data", (chunk) => (body += chunk));
				await new Promise((resolve) => req.on("end", resolve));
				const { lid, gameAttributes, deleteKeys } = JSON.parse(body);
				const db = openDb(process.env.ZENGM_DB_DIR, lid);
				writeGameAttributes(db, gameAttributes, deleteKeys ?? []);
				send(200, { ok: true });
				return;
			}

			if (key === "GET /game-attributes") {
				const url2 = new URL(req.url, `http://127.0.0.1:${apiPort}`);
				const lid = Number(url2.searchParams.get("lid"));
				if (!lid) {
					send(400, { error: "lid required" });
					return;
				}
				const db = openDb(process.env.ZENGM_DB_DIR, lid);
				if (url2.searchParams.get("mode") === "count") {
					send(200, { count: countGameAttributes(db) });
					return;
				}
				send(200, { gameAttributes: readGameAttributes(db) });
				return;
			}

			if (key === "POST /schedule/flush") {
				let body = "";
				req.on("data", (chunk) => (body += chunk));
				await new Promise((resolve) => req.on("end", resolve));
				const { lid, scheduleGames, deleteGids } = JSON.parse(body);
				const db = openDb(process.env.ZENGM_DB_DIR, lid);
				writeSchedule(db, scheduleGames, deleteGids ?? []);
				send(200, { ok: true });
				return;
			}

			if (key === "GET /schedule") {
				const url2 = new URL(req.url, `http://127.0.0.1:${apiPort}`);
				const lid = Number(url2.searchParams.get("lid"));
				if (!lid) {
					send(400, { error: "lid required" });
					return;
				}
				const db = openDb(process.env.ZENGM_DB_DIR, lid);
				if (url2.searchParams.get("mode") === "count") {
					send(200, { count: countSchedule(db) });
					return;
				}
				if (url2.searchParams.get("mode") === "maxgid") {
					send(200, { maxGid: maxScheduleGid(db) });
					return;
				}
				send(200, { scheduleGames: readSchedule(db) });
				return;
			}

			if (key === "POST /draft-picks/flush") {
				let body = "";
				req.on("data", (chunk) => (body += chunk));
				await new Promise((resolve) => req.on("end", resolve));
				const { lid, draftPicks, deleteDpids } = JSON.parse(body);
				const db = openDb(process.env.ZENGM_DB_DIR, lid);
				writeDraftPicks(db, draftPicks, deleteDpids ?? []);
				send(200, { ok: true });
				return;
			}

			if (key === "GET /draft-picks") {
				const url2 = new URL(req.url, `http://127.0.0.1:${apiPort}`);
				const lid = Number(url2.searchParams.get("lid"));
				if (!lid) {
					send(400, { error: "lid required" });
					return;
				}
				const db = openDb(process.env.ZENGM_DB_DIR, lid);
				if (url2.searchParams.get("mode") === "count") {
					send(200, { count: countDraftPicks(db) });
					return;
				}
				send(200, { draftPicks: readDraftPicks(db) });
				return;
			}

			if (key === "POST /negotiations/flush") {
				let body = "";
				req.on("data", (chunk) => (body += chunk));
				await new Promise((resolve) => req.on("end", resolve));
				const { lid, negotiations, deletePids } = JSON.parse(body);
				const db = openDb(process.env.ZENGM_DB_DIR, lid);
				writeNegotiations(db, negotiations, deletePids ?? []);
				send(200, { ok: true });
				return;
			}

			if (key === "GET /negotiations") {
				const url2 = new URL(req.url, `http://127.0.0.1:${apiPort}`);
				const lid = Number(url2.searchParams.get("lid"));
				if (!lid) {
					send(400, { error: "lid required" });
					return;
				}
				const db = openDb(process.env.ZENGM_DB_DIR, lid);
				if (url2.searchParams.get("mode") === "count") {
					send(200, { count: countNegotiations(db) });
					return;
				}
				send(200, { negotiations: readNegotiations(db) });
				return;
			}

			if (key === "POST /released-players/flush") {
				let body = "";
				req.on("data", (chunk) => (body += chunk));
				await new Promise((resolve) => req.on("end", resolve));
				const { lid, releasedPlayers, deleteRids } = JSON.parse(body);
				const db = openDb(process.env.ZENGM_DB_DIR, lid);
				writeReleasedPlayers(db, releasedPlayers, deleteRids ?? []);
				send(200, { ok: true });
				return;
			}

			if (key === "GET /released-players") {
				const url2 = new URL(req.url, `http://127.0.0.1:${apiPort}`);
				const lid = Number(url2.searchParams.get("lid"));
				if (!lid) {
					send(400, { error: "lid required" });
					return;
				}
				const db = openDb(process.env.ZENGM_DB_DIR, lid);
				if (url2.searchParams.get("mode") === "count") {
					send(200, { count: countReleasedPlayers(db) });
					return;
				}
				send(200, { releasedPlayers: readReleasedPlayers(db) });
				return;
			}

			if (key === "POST /trade/flush") {
				let body = "";
				req.on("data", (chunk) => (body += chunk));
				await new Promise((resolve) => req.on("end", resolve));
				const { lid, trades, deleteRids } = JSON.parse(body);
				const db = openDb(process.env.ZENGM_DB_DIR, lid);
				writeTrade(db, trades, deleteRids ?? []);
				send(200, { ok: true });
				return;
			}

			if (key === "GET /trade") {
				const url2 = new URL(req.url, `http://127.0.0.1:${apiPort}`);
				const lid = Number(url2.searchParams.get("lid"));
				if (!lid) {
					send(400, { error: "lid required" });
					return;
				}
				const db = openDb(process.env.ZENGM_DB_DIR, lid);
				if (url2.searchParams.get("mode") === "count") {
					send(200, { count: countTrade(db) });
					return;
				}
				send(200, { trades: readTrade(db) });
				return;
			}

			if (key === "POST /saved-trades/flush") {
				let body = "";
				req.on("data", (chunk) => (body += chunk));
				await new Promise((resolve) => req.on("end", resolve));
				const { lid, savedTrades, deleteHashes } = JSON.parse(body);
				const db = openDb(process.env.ZENGM_DB_DIR, lid);
				writeSavedTrades(db, savedTrades, deleteHashes ?? []);
				send(200, { ok: true });
				return;
			}

			if (key === "GET /saved-trades") {
				const url2 = new URL(req.url, `http://127.0.0.1:${apiPort}`);
				const lid = Number(url2.searchParams.get("lid"));
				if (!lid) {
					send(400, { error: "lid required" });
					return;
				}
				const db = openDb(process.env.ZENGM_DB_DIR, lid);
				if (url2.searchParams.get("mode") === "count") {
					send(200, { count: countSavedTrades(db) });
					return;
				}
				send(200, { savedTrades: readSavedTrades(db) });
				return;
			}

			if (key === "POST /saved-trading-block/flush") {
				let body = "";
				req.on("data", (chunk) => (body += chunk));
				await new Promise((resolve) => req.on("end", resolve));
				const { lid, blocks, deleteRids } = JSON.parse(body);
				const db = openDb(process.env.ZENGM_DB_DIR, lid);
				writeSavedTradingBlock(db, blocks, deleteRids ?? []);
				send(200, { ok: true });
				return;
			}

			if (key === "GET /saved-trading-block") {
				const url2 = new URL(req.url, `http://127.0.0.1:${apiPort}`);
				const lid = Number(url2.searchParams.get("lid"));
				if (!lid) {
					send(400, { error: "lid required" });
					return;
				}
				const db = openDb(process.env.ZENGM_DB_DIR, lid);
				if (url2.searchParams.get("mode") === "count") {
					send(200, { count: countSavedTradingBlock(db) });
					return;
				}
				send(200, { blocks: readSavedTradingBlock(db) });
				return;
			}

			if (key === "POST /messages/flush") {
				let body = "";
				req.on("data", (chunk) => (body += chunk));
				await new Promise((resolve) => req.on("end", resolve));
				const { lid, messages, deleteMids } = JSON.parse(body);
				const db = openDb(process.env.ZENGM_DB_DIR, lid);
				writeMessages(db, messages, deleteMids ?? []);
				send(200, { ok: true });
				return;
			}

			if (key === "GET /messages") {
				const url2 = new URL(req.url, `http://127.0.0.1:${apiPort}`);
				const lid = Number(url2.searchParams.get("lid"));
				if (!lid) {
					send(400, { error: "lid required" });
					return;
				}
				const db = openDb(process.env.ZENGM_DB_DIR, lid);
				if (url2.searchParams.get("mode") === "count") {
					send(200, { count: countMessages(db) });
					return;
				}
				if (url2.searchParams.get("mode") === "maxmid") {
					send(200, { maxMid: maxMessageMid(db) });
					return;
				}
				const filter = {};
				if (url2.searchParams.has("mid"))
					filter.mid = Number(url2.searchParams.get("mid"));
				else if (url2.searchParams.has("limit"))
					filter.limit = Number(url2.searchParams.get("limit"));
				send(200, { messages: readMessages(db, filter) });
				return;
			}

			if (key === "POST /all-stars/flush") {
				let body = "";
				req.on("data", (chunk) => (body += chunk));
				await new Promise((resolve) => req.on("end", resolve));
				const { lid, allStars, deleteSeasons } = JSON.parse(body);
				const db = openDb(process.env.ZENGM_DB_DIR, lid);
				writeAllStars(db, allStars, deleteSeasons ?? []);
				send(200, { ok: true });
				return;
			}

			if (key === "GET /all-stars") {
				const url2 = new URL(req.url, `http://127.0.0.1:${apiPort}`);
				const lid = Number(url2.searchParams.get("lid"));
				if (!lid) {
					send(400, { error: "lid required" });
					return;
				}
				const db = openDb(process.env.ZENGM_DB_DIR, lid);
				if (url2.searchParams.get("mode") === "count") {
					send(200, { count: countAllStars(db) });
					return;
				}
				const season = url2.searchParams.has("season")
					? Number(url2.searchParams.get("season"))
					: undefined;
				send(200, { allStars: readAllStars(db, season) });
				return;
			}

			if (key === "POST /awards/flush") {
				let body = "";
				req.on("data", (chunk) => (body += chunk));
				await new Promise((resolve) => req.on("end", resolve));
				const { lid, awards, deleteSeasons } = JSON.parse(body);
				const db = openDb(process.env.ZENGM_DB_DIR, lid);
				writeAwards(db, awards, deleteSeasons ?? []);
				send(200, { ok: true });
				return;
			}

			if (key === "GET /awards") {
				const url2 = new URL(req.url, `http://127.0.0.1:${apiPort}`);
				const lid = Number(url2.searchParams.get("lid"));
				if (!lid) {
					send(400, { error: "lid required" });
					return;
				}
				const db = openDb(process.env.ZENGM_DB_DIR, lid);
				if (url2.searchParams.get("mode") === "count") {
					send(200, { count: countAwards(db) });
					return;
				}
				const season = url2.searchParams.has("season")
					? Number(url2.searchParams.get("season"))
					: undefined;
				send(200, { awards: readAwards(db, season) });
				return;
			}

			if (key === "POST /draft-lottery-results/flush") {
				let body = "";
				req.on("data", (chunk) => (body += chunk));
				await new Promise((resolve) => req.on("end", resolve));
				const { lid, draftLotteryResults, deleteSeasons } = JSON.parse(body);
				const db = openDb(process.env.ZENGM_DB_DIR, lid);
				writeDraftLotteryResults(db, draftLotteryResults, deleteSeasons ?? []);
				send(200, { ok: true });
				return;
			}

			if (key === "GET /draft-lottery-results") {
				const url2 = new URL(req.url, `http://127.0.0.1:${apiPort}`);
				const lid = Number(url2.searchParams.get("lid"));
				if (!lid) {
					send(400, { error: "lid required" });
					return;
				}
				const db = openDb(process.env.ZENGM_DB_DIR, lid);
				if (url2.searchParams.get("mode") === "count") {
					send(200, { count: countDraftLotteryResults(db) });
					return;
				}
				const season = url2.searchParams.has("season")
					? Number(url2.searchParams.get("season"))
					: undefined;
				send(200, { draftLotteryResults: readDraftLotteryResults(db, season) });
				return;
			}

			if (key === "POST /events/flush") {
				let body = "";
				req.on("data", (chunk) => (body += chunk));
				await new Promise((resolve) => req.on("end", resolve));
				const { lid, events, deleteEids } = JSON.parse(body);
				const db = openDb(process.env.ZENGM_DB_DIR, lid);
				writeEvents(db, events, deleteEids ?? []);
				send(200, { ok: true });
				return;
			}

			if (key === "GET /events") {
				const url2 = new URL(req.url, `http://127.0.0.1:${apiPort}`);
				const lid = Number(url2.searchParams.get("lid"));
				if (!lid) {
					send(400, { error: "lid required" });
					return;
				}
				const db = openDb(process.env.ZENGM_DB_DIR, lid);
				if (url2.searchParams.get("mode") === "count") {
					send(200, { count: countEvents(db) });
					return;
				}
				if (url2.searchParams.get("mode") === "maxeid") {
					send(200, { maxEid: maxEventEid(db) });
					return;
				}
				const filter = {};
				if (url2.searchParams.has("eid"))
					filter.eid = Number(url2.searchParams.get("eid"));
				else if (url2.searchParams.has("season"))
					filter.season = Number(url2.searchParams.get("season"));
				else if (url2.searchParams.has("pid"))
					filter.pid = Number(url2.searchParams.get("pid"));
				else if (url2.searchParams.has("dpid"))
					filter.dpid = Number(url2.searchParams.get("dpid"));
				send(200, { events: readEvents(db, filter) });
				return;
			}

			if (key === "POST /head-to-heads/flush") {
				let body = "";
				req.on("data", (chunk) => (body += chunk));
				await new Promise((resolve) => req.on("end", resolve));
				const { lid, headToHeads, deleteSeasons } = JSON.parse(body);
				const db = openDb(process.env.ZENGM_DB_DIR, lid);
				writeHeadToHeads(db, headToHeads, deleteSeasons ?? []);
				send(200, { ok: true });
				return;
			}

			if (key === "GET /head-to-heads") {
				const url2 = new URL(req.url, `http://127.0.0.1:${apiPort}`);
				const lid = Number(url2.searchParams.get("lid"));
				if (!lid) {
					send(400, { error: "lid required" });
					return;
				}
				const db = openDb(process.env.ZENGM_DB_DIR, lid);
				if (url2.searchParams.get("mode") === "count") {
					send(200, { count: countHeadToHeads(db) });
					return;
				}
				const season = url2.searchParams.has("season")
					? Number(url2.searchParams.get("season"))
					: undefined;
				send(200, { headToHeads: readHeadToHeads(db, season) });
				return;
			}

			if (key === "POST /player-feats/flush") {
				let body = "";
				req.on("data", (chunk) => (body += chunk));
				await new Promise((resolve) => req.on("end", resolve));
				const { lid, playerFeats, deleteFids } = JSON.parse(body);
				const db = openDb(process.env.ZENGM_DB_DIR, lid);
				writePlayerFeats(db, playerFeats, deleteFids ?? []);
				send(200, { ok: true });
				return;
			}

			if (key === "GET /player-feats") {
				const url2 = new URL(req.url, `http://127.0.0.1:${apiPort}`);
				const lid = Number(url2.searchParams.get("lid"));
				if (!lid) {
					send(400, { error: "lid required" });
					return;
				}
				const db = openDb(process.env.ZENGM_DB_DIR, lid);
				if (url2.searchParams.get("mode") === "count") {
					send(200, { count: countPlayerFeats(db) });
					return;
				}
				if (url2.searchParams.get("mode") === "maxfid") {
					send(200, { maxFid: maxPlayerFeatFid(db) });
					return;
				}
				send(200, { playerFeats: readPlayerFeats(db) });
				return;
			}

			if (key === "POST /playoff-series/flush") {
				let body = "";
				req.on("data", (chunk) => (body += chunk));
				await new Promise((resolve) => req.on("end", resolve));
				const { lid, playoffSeries, deleteSeasons } = JSON.parse(body);
				const db = openDb(process.env.ZENGM_DB_DIR, lid);
				writePlayoffSeries(db, playoffSeries, deleteSeasons ?? []);
				send(200, { ok: true });
				return;
			}

			if (key === "GET /playoff-series") {
				const url2 = new URL(req.url, `http://127.0.0.1:${apiPort}`);
				const lid = Number(url2.searchParams.get("lid"));
				if (!lid) {
					send(400, { error: "lid required" });
					return;
				}
				const db = openDb(process.env.ZENGM_DB_DIR, lid);
				if (url2.searchParams.get("mode") === "count") {
					send(200, { count: countPlayoffSeries(db) });
					return;
				}
				send(200, { playoffSeries: readPlayoffSeries(db) });
				return;
			}

			if (key === "POST /scheduled-events/flush") {
				let body = "";
				req.on("data", (chunk) => (body += chunk));
				await new Promise((resolve) => req.on("end", resolve));
				const { lid, scheduledEvents, deleteIds } = JSON.parse(body);
				const db = openDb(process.env.ZENGM_DB_DIR, lid);
				writeScheduledEvents(db, scheduledEvents, deleteIds ?? []);
				send(200, { ok: true });
				return;
			}

			if (key === "GET /scheduled-events") {
				const url2 = new URL(req.url, `http://127.0.0.1:${apiPort}`);
				const lid = Number(url2.searchParams.get("lid"));
				if (!lid) {
					send(400, { error: "lid required" });
					return;
				}
				const db = openDb(process.env.ZENGM_DB_DIR, lid);
				if (url2.searchParams.get("mode") === "count") {
					send(200, { count: countScheduledEvents(db) });
					return;
				}
				if (url2.searchParams.get("mode") === "maxid") {
					send(200, { maxId: maxScheduledEventId(db) });
					return;
				}
				const season = url2.searchParams.has("season")
					? Number(url2.searchParams.get("season"))
					: undefined;
				send(200, { scheduledEvents: readScheduledEvents(db, season) });
				return;
			}

			if (key === "POST /season-leaders/flush") {
				let body = "";
				req.on("data", (chunk) => (body += chunk));
				await new Promise((resolve) => req.on("end", resolve));
				const { lid, seasonLeaders, deleteSeasons } = JSON.parse(body);
				const db = openDb(process.env.ZENGM_DB_DIR, lid);
				writeSeasonLeaders(db, seasonLeaders, deleteSeasons ?? []);
				send(200, { ok: true });
				return;
			}

			if (key === "GET /season-leaders") {
				const url2 = new URL(req.url, `http://127.0.0.1:${apiPort}`);
				const lid = Number(url2.searchParams.get("lid"));
				if (!lid) {
					send(400, { error: "lid required" });
					return;
				}
				const db = openDb(process.env.ZENGM_DB_DIR, lid);
				if (url2.searchParams.get("mode") === "count") {
					send(200, { count: countSeasonLeaders(db) });
					return;
				}
				const fromSeason = url2.searchParams.has("fromSeason")
					? Number(url2.searchParams.get("fromSeason"))
					: undefined;
				send(200, { seasonLeaders: readSeasonLeaders(db, fromSeason) });
				return;
			}

			// ---- Meta DB routes ------------------------------------------------

			if (key === "GET /meta/leagues") {
				const mdb = openMetaDb(process.env.ZENGM_DB_DIR);
				send(200, { leagues: getAllLeagues(mdb) });
				return;
			}

			if (key === "GET /meta/league") {
				const url2 = new URL(req.url, `http://127.0.0.1:${apiPort}`);
				const lid = Number(url2.searchParams.get("lid"));
				const mdb = openMetaDb(process.env.ZENGM_DB_DIR);
				send(200, { league: getLeague(mdb, lid) ?? null });
				return;
			}

			if (key === "GET /meta/league/maxlid") {
				const mdb = openMetaDb(process.env.ZENGM_DB_DIR);
				send(200, { maxLid: getMaxLeagueLid(mdb) });
				return;
			}

			if (key === "POST /meta/league") {
				let body = "";
				req.on("data", (chunk) => (body += chunk));
				await new Promise((resolve) => req.on("end", resolve));
				const { league: l } = JSON.parse(body);
				const mdb = openMetaDb(process.env.ZENGM_DB_DIR);
				putLeague(mdb, l);
				send(200, { ok: true, lid: l.lid });
				return;
			}

			if (key === "DELETE /meta/league") {
				const url2 = new URL(req.url, `http://127.0.0.1:${apiPort}`);
				const lid = Number(url2.searchParams.get("lid"));
				const mdb = openMetaDb(process.env.ZENGM_DB_DIR);
				deleteLeague(mdb, lid);
				try {
					deleteLeagueDb(process.env.ZENGM_DB_DIR, lid);
				} catch (e) {
					console.warn(`deleteLeagueDb lid=${lid} failed:`, e.message);
				}
				send(200, { ok: true });
				return;
			}

			if (key === "DELETE /meta/leagues") {
				const mdb = openMetaDb(process.env.ZENGM_DB_DIR);
				clearLeagues(mdb);
				send(200, { ok: true });
				return;
			}

			if (key === "GET /meta/attribute") {
				const url2 = new URL(req.url, `http://127.0.0.1:${apiPort}`);
				const attrKey = url2.searchParams.get("key");
				const mdb = openMetaDb(process.env.ZENGM_DB_DIR);
				const value = getAttribute(mdb, attrKey);
				send(200, { found: value !== undefined, value: value ?? null });
				return;
			}

			if (key === "PUT /meta/attribute") {
				let body = "";
				req.on("data", (chunk) => (body += chunk));
				await new Promise((resolve) => req.on("end", resolve));
				const { key: attrKey, value } = JSON.parse(body);
				const mdb = openMetaDb(process.env.ZENGM_DB_DIR);
				putAttribute(mdb, attrKey, value);
				send(200, { ok: true });
				return;
			}

			if (key === "DELETE /meta/attribute") {
				const url2 = new URL(req.url, `http://127.0.0.1:${apiPort}`);
				const attrKey = url2.searchParams.get("key");
				const mdb = openMetaDb(process.env.ZENGM_DB_DIR);
				deleteAttribute(mdb, attrKey);
				send(200, { ok: true });
				return;
			}

			if (key === "GET /meta/achievements") {
				const mdb = openMetaDb(process.env.ZENGM_DB_DIR);
				send(200, { achievements: getAllAchievements(mdb) });
				return;
			}

			if (key === "POST /meta/achievements") {
				let body = "";
				req.on("data", (chunk) => (body += chunk));
				await new Promise((resolve) => req.on("end", resolve));
				const { achievements } = JSON.parse(body);
				const mdb = openMetaDb(process.env.ZENGM_DB_DIR);
				addAchievements(mdb, achievements);
				send(200, { ok: true });
				return;
			}

			if (key === "DELETE /meta/achievements") {
				const mdb = openMetaDb(process.env.ZENGM_DB_DIR);
				clearAchievements(mdb);
				send(200, { ok: true });
				return;
			}

			if (key === "POST /league/clone") {
				let body = "";
				req.on("data", (chunk) => (body += chunk));
				await new Promise((resolve) => req.on("end", resolve));
				const { lidOld, lidNew } = JSON.parse(body);
				if (typeof lidOld !== "number" || typeof lidNew !== "number") {
					send(400, { error: "lidOld and lidNew (numbers) required" });
					return;
				}
				cloneLeague(process.env.ZENGM_DB_DIR, lidOld, lidNew);
				send(200, { ok: true });
				return;
			}

			if (key === "POST /delete-old-data") {
				let body = "";
				req.on("data", (chunk) => (body += chunk));
				await new Promise((resolve) => req.on("end", resolve));
				const { lid, options, currentSeason, userTid } = JSON.parse(body);
				if (!lid || !options || currentSeason === undefined) {
					send(400, { error: "lid, options, currentSeason required" });
					return;
				}
				const db = openDb(process.env.ZENGM_DB_DIR, lid);
				deleteOldData(db, options, currentSeason, userTid);
				send(200, { ok: true });
				return;
			}

			if (key === "POST /log") {
				let body = "";
				req.on("data", (chunk) => (body += chunk));
				await new Promise((resolve) => req.on("end", resolve));
				const logDir = path.join(__dirname, "..", "logs");
				fs.mkdirSync(logDir, { recursive: true });
				fs.appendFileSync(
					path.join(logDir, "worker.log"),
					`${new Date().toISOString()} ${body}\n`,
				);
				send(200, { ok: true });
				return;
			}

			send(404, { error: "Not found" });
		} catch (err) {
			send(500, { error: String(err) });
		}
	});

	server.listen(apiPort, "127.0.0.1", () => {
		console.log(`[Electron API] http://127.0.0.1:${apiPort}`);
	});
}

function createWindow() {
	const win = new BrowserWindow({
		width: 1280,
		height: 900,
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: true,
			nodeIntegrationInWorker: true,
		},
	});

	win.loadURL(DEV_URL);
	startApiServer(win);
	return win;
}

app.whenReady().then(() => {
	// Load DB directory from electron/settings.json, falling back to userData
	let dbDir;
	try {
		const settingsFile = path.join(__dirname, "settings.json");
		const settings = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
		if (settings.dbDir) {
			dbDir = settings.dbDir;
		}
	} catch {}
	if (!dbDir) {
		dbDir = app.getPath("userData");
	}
	fs.mkdirSync(dbDir, { recursive: true });
	// Set before createWindow() so the renderer process inherits it
	process.env.ZENGM_DB_DIR = dbDir;

	createWindow();

	// macOS: re-create window when dock icon is clicked and no windows are open
	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow();
		}
	});
});

app.on("window-all-closed", () => {
	app.quit();
});
