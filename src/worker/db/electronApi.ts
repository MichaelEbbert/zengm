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

export async function flushPlayers(
	lid: number,
	players: any[],
	deletePids: number[] = [],
): Promise<void> {
	if (!(await isAvailable())) return;
	try {
		await fetch(`${API}/players/flush`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ lid, players, deletePids }),
		});
	} catch {}
}

export async function readActivePlayers(lid: number): Promise<any[] | null> {
	if (!(await isAvailable())) return null;
	try {
		const r = await fetch(`${API}/players?lid=${lid}&mode=active`);
		if (!r.ok) return null;
		const data = await r.json();
		return data.players;
	} catch {
		return null;
	}
}

export async function countSqlitePlayers(lid: number): Promise<number> {
	if (!(await isAvailable())) return 0;
	try {
		const r = await fetch(`${API}/players?lid=${lid}&mode=count`);
		if (!r.ok) return 0;
		const data = await r.json();
		return data.count;
	} catch {
		return 0;
	}
}

export async function flushTeams(
	lid: number,
	teams: any[],
	deleteTids: number[] = [],
): Promise<void> {
	if (!(await isAvailable())) return;
	try {
		await fetch(`${API}/teams/flush`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ lid, teams, deleteTids }),
		});
	} catch {}
}

export async function readAllTeams(lid: number): Promise<any[] | null> {
	if (!(await isAvailable())) return null;
	try {
		const r = await fetch(`${API}/teams?lid=${lid}`);
		if (!r.ok) return null;
		const data = await r.json();
		return data.teams;
	} catch {
		return null;
	}
}

export async function countSqliteTeams(lid: number): Promise<number> {
	if (!(await isAvailable())) return 0;
	try {
		const r = await fetch(`${API}/teams?lid=${lid}&mode=count`);
		if (!r.ok) return 0;
		const data = await r.json();
		return data.count;
	} catch {
		return 0;
	}
}

export async function flushTeamSeasons(
	lid: number,
	teamSeasons: any[],
	deleteRids: number[] = [],
): Promise<void> {
	if (!(await isAvailable())) return;
	try {
		await fetch(`${API}/team-seasons/flush`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ lid, teamSeasons, deleteRids }),
		});
	} catch {}
}

type TeamSeasonFilter =
	| { note: true }
	| { tid: number; season: number }
	| { season: number }
	| { tid: number; seasonFrom: number; seasonTo?: number }
	| { tid: number }
	| { seasonFrom: number }
	| Record<string, never>;

export async function readTeamSeasons(
	lid: number,
	filter: TeamSeasonFilter,
): Promise<any[] | null> {
	if (!(await isAvailable())) return null;
	try {
		const params = new URLSearchParams({ lid: String(lid) });
		if ("note" in filter) {
			params.set("note", "1");
		} else if ("tid" in filter && "season" in filter) {
			params.set("tid", String((filter as any).tid));
			params.set("season", String((filter as any).season));
		} else if ("tid" in filter && "seasonFrom" in filter) {
			params.set("tid", String((filter as any).tid));
			params.set("seasonFrom", String((filter as any).seasonFrom));
			if ((filter as any).seasonTo !== undefined)
				params.set("seasonTo", String((filter as any).seasonTo));
		} else if ("tid" in filter) {
			params.set("tid", String((filter as any).tid));
		} else if ("season" in filter) {
			params.set("season", String((filter as any).season));
		} else if ("seasonFrom" in filter) {
			params.set("seasonFrom", String((filter as any).seasonFrom));
		}
		const r = await fetch(`${API}/team-seasons?${params}`);
		if (!r.ok) return null;
		const data = await r.json();
		return data.teamSeasons;
	} catch {
		return null;
	}
}

export async function countSqliteTeamSeasons(lid: number): Promise<number> {
	if (!(await isAvailable())) return 0;
	try {
		const r = await fetch(`${API}/team-seasons?lid=${lid}&mode=count`);
		if (!r.ok) return 0;
		const data = await r.json();
		return data.count;
	} catch {
		return 0;
	}
}

export async function flushTeamStats(
	lid: number,
	teamStats: any[],
	deleteRids: number[] = [],
): Promise<void> {
	if (!(await isAvailable())) return;
	try {
		await fetch(`${API}/team-stats/flush`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ lid, teamStats, deleteRids }),
		});
	} catch {}
}

type TeamStatsFilter =
	| { season: number; tid: number }
	| { season: number }
	| { tid: number }
	| Record<string, never>;

export async function readTeamStats(
	lid: number,
	filter: TeamStatsFilter,
): Promise<any[] | null> {
	if (!(await isAvailable())) return null;
	try {
		const params = new URLSearchParams({ lid: String(lid) });
		if ("season" in filter)
			params.set("season", String((filter as any).season));
		if ("tid" in filter) params.set("tid", String((filter as any).tid));
		const r = await fetch(`${API}/team-stats?${params}`);
		if (!r.ok) return null;
		const data = await r.json();
		return data.teamStats;
	} catch {
		return null;
	}
}

export async function countSqliteTeamStats(lid: number): Promise<number> {
	if (!(await isAvailable())) return 0;
	try {
		const r = await fetch(`${API}/team-stats?lid=${lid}&mode=count`);
		if (!r.ok) return 0;
		const data = await r.json();
		return data.count;
	} catch {
		return 0;
	}
}

type PlayerFilter =
	| { pid: number }
	| { pids: number[] }
	| { tid: number }
	| { retiredYear: number }
	| { draftYear: number }
	| { statsTid: number }
	| { hof: true }
	| { note: true }
	| { watch: true }
	| { activeAndRetired: true }
	| { activeSeason: number }
	| Record<string, never>;

export async function readPlayersFilter(
	lid: number,
	filter: PlayerFilter,
): Promise<any[] | null> {
	if (!(await isAvailable())) return null;
	try {
		const params = new URLSearchParams({ lid: String(lid) });
		if ("pid" in filter) params.set("pid", String(filter.pid));
		else if ("pids" in filter) params.set("pids", filter.pids.join(","));
		else if ("tid" in filter) params.set("tid", String(filter.tid));
		else if ("retiredYear" in filter)
			params.set("retiredYear", String(filter.retiredYear));
		else if ("draftYear" in filter)
			params.set("draftYear", String(filter.draftYear));
		else if ("statsTid" in filter)
			params.set("statsTid", String(filter.statsTid));
		else if ("hof" in filter) params.set("hof", "1");
		else if ("note" in filter) params.set("note", "1");
		else if ("watch" in filter) params.set("watch", "1");
		else if ("activeAndRetired" in filter) params.set("activeAndRetired", "1");
		else if ("activeSeason" in filter)
			params.set("activeSeason", String(filter.activeSeason));
		const r = await fetch(`${API}/players?${params}`);
		if (!r.ok) return null;
		const data = await r.json();
		return data.players;
	} catch {
		return null;
	}
}
