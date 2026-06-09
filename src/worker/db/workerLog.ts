// File logger for the Electron worker.
// Sends log messages via fetch to the Electron API server (port 3001),
// which writes them to logs/worker.log. No-ops silently outside Electron.

export async function wlog(msg: string): Promise<void> {
	try {
		await fetch("http://127.0.0.1:3001/log", {
			method: "POST",
			body: msg,
		});
	} catch {}
}
