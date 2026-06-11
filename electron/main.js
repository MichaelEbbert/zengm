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
				"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
				writeGame(db, gameStats);
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
