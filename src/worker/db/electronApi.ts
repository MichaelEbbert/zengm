// HTTP client for SQLite operations delegated to the Electron main process.
// All calls return null/void silently when not running in Electron.

const API = "http://127.0.0.1:3001";

let _available: boolean | undefined;

async function isAvailable(): Promise<boolean> {
	if (_available !== undefined) return _available;
	try {
		const r = await fetch(`${API}/config`);
		_available = r.ok;
	} catch {
		_available = false;
	}
	return _available;
}

export async function writeGame(lid: number, gameStats: any): Promise<void> {
	if (!(await isAvailable())) return;
	try {
		await fetch(`${API}/game`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ lid, gameStats }),
		});
	} catch {}
}

export async function readGames(
	lid: number,
	filter: { gid?: number; season?: number } = {},
): Promise<{
	gameRows: any[];
	teamRows: any[];
	playerRows: any[];
	scoringRows: any[];
} | null> {
	if (!(await isAvailable())) return null;
	try {
		const params = new URLSearchParams({ lid: String(lid) });
		if (filter.gid !== undefined) params.set("gid", String(filter.gid));
		if (filter.season !== undefined)
			params.set("season", String(filter.season));
		const r = await fetch(`${API}/games?${params}`);
		if (!r.ok) return null;
		return r.json();
	} catch {
		return null;
	}
}

export async function getMaxGameGid(lid: number): Promise<number | null> {
	if (!(await isAvailable())) return null;
	try {
		const r = await fetch(`${API}/games/maxgid?lid=${lid}`);
		if (!r.ok) return null;
		const data = await r.json();
		return data.maxGid;
	} catch {
		return null;
	}
}
