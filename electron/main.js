import { app, BrowserWindow } from "electron";

// Dev server port — matches getPort({ port: 3000 }) default in tools/lib/server.ts.
// Override with ELECTRON_DEV_PORT if the server landed on a different port.
const port = process.env.ELECTRON_DEV_PORT ?? "3000";
const DEV_URL = `http://localhost:${port}`;

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
