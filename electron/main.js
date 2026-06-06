import { app, BrowserWindow } from "electron";
import http from "http";

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
				const status = await callWorker(win, "main", "getLeagueStatus", undefined);
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

			if (key === "GET /query") {
				send(501, { error: "SQL query not available until Phase 2 (SQLite)" });
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
			nodeIntegration: false,
		},
	});

	win.loadURL(DEV_URL);
	startApiServer(win);
	return win;
}

app.whenReady().then(() => {
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
