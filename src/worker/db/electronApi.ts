// HTTP client for SQLite operations delegated to the Electron main process.
// All calls return null/void silently when not running in Electron.

import { wlog } from "./workerLog.ts";

const API = "http://127.0.0.1:3001";

let _available: boolean | undefined;

async function isAvailable(): Promise<boolean> {
	if (_available !== undefined) return _available;
	try {
		const ac = new AbortController();
		const timer = setTimeout(() => ac.abort(), 500);
		try {
			const r = await fetch(`${API}/config`, { signal: ac.signal });
			clearTimeout(timer);
			if (r.ok) {
				_available = true;
				return true;
			}
		} finally {
			clearTimeout(timer);
		}
	} catch {}
	_available = false;
	return false;
}

export async function writeGame(lid: number, gameStats: any): Promise<void> {
	if (!(await isAvailable())) return;
	try {
		const r = await fetch(`${API}/game`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ lid, gameStats }),
		});
		if (!r.ok) {
			const text = await r.text().catch(() => "(no body)");
			await wlog(
				`writeGame FAILED gid=${gameStats.gid} status=${r.status} body=${text}`,
			);
		}
	} catch (err) {
		await wlog(`writeGame EXCEPTION gid=${gameStats.gid} err=${err}`);
	}
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

// ---- Phase 5A client functions ----------------------------------------

export async function flushGameAttributes(
	lid: number,
	gameAttributes: any[],
	deleteKeys: string[] = [],
): Promise<void> {
	if (!(await isAvailable())) return;
	try {
		await fetch(`${API}/game-attributes/flush`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ lid, gameAttributes, deleteKeys }),
		});
	} catch {}
}

export async function readAllGameAttributes(
	lid: number,
): Promise<any[] | null> {
	if (!(await isAvailable())) return null;
	try {
		const r = await fetch(`${API}/game-attributes?lid=${lid}`);
		if (!r.ok) return null;
		const data = await r.json();
		return data.gameAttributes;
	} catch {
		return null;
	}
}

export async function countSqliteGameAttributes(lid: number): Promise<number> {
	if (!(await isAvailable())) return 0;
	try {
		const r = await fetch(`${API}/game-attributes?lid=${lid}&mode=count`);
		if (!r.ok) return 0;
		const data = await r.json();
		return data.count;
	} catch {
		return 0;
	}
}

export async function flushSchedule(
	lid: number,
	scheduleGames: any[],
	deleteGids: number[] = [],
): Promise<void> {
	if (!(await isAvailable())) return;
	try {
		await fetch(`${API}/schedule/flush`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ lid, scheduleGames, deleteGids }),
		});
	} catch {}
}

export async function readAllSchedule(lid: number): Promise<any[] | null> {
	if (!(await isAvailable())) return null;
	try {
		const r = await fetch(`${API}/schedule?lid=${lid}`);
		if (!r.ok) return null;
		const data = await r.json();
		return data.scheduleGames;
	} catch {
		return null;
	}
}

export async function countSqliteSchedule(lid: number): Promise<number> {
	if (!(await isAvailable())) return 0;
	try {
		const r = await fetch(`${API}/schedule?lid=${lid}&mode=count`);
		if (!r.ok) return 0;
		const data = await r.json();
		return data.count;
	} catch {
		return 0;
	}
}

export async function flushDraftPicks(
	lid: number,
	draftPicks: any[],
	deleteDpids: number[] = [],
): Promise<void> {
	if (!(await isAvailable())) return;
	try {
		await fetch(`${API}/draft-picks/flush`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ lid, draftPicks, deleteDpids }),
		});
	} catch {}
}

export async function readAllDraftPicks(lid: number): Promise<any[] | null> {
	if (!(await isAvailable())) return null;
	try {
		const r = await fetch(`${API}/draft-picks?lid=${lid}`);
		if (!r.ok) return null;
		const data = await r.json();
		return data.draftPicks;
	} catch {
		return null;
	}
}

export async function countSqliteDraftPicks(lid: number): Promise<number> {
	if (!(await isAvailable())) return 0;
	try {
		const r = await fetch(`${API}/draft-picks?lid=${lid}&mode=count`);
		if (!r.ok) return 0;
		const data = await r.json();
		return data.count;
	} catch {
		return 0;
	}
}

export async function flushNegotiations(
	lid: number,
	negotiations: any[],
	deletePids: number[] = [],
): Promise<void> {
	if (!(await isAvailable())) return;
	try {
		await fetch(`${API}/negotiations/flush`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ lid, negotiations, deletePids }),
		});
	} catch {}
}

export async function readAllNegotiations(lid: number): Promise<any[] | null> {
	if (!(await isAvailable())) return null;
	try {
		const r = await fetch(`${API}/negotiations?lid=${lid}`);
		if (!r.ok) return null;
		const data = await r.json();
		return data.negotiations;
	} catch {
		return null;
	}
}

export async function countSqliteNegotiations(lid: number): Promise<number> {
	if (!(await isAvailable())) return 0;
	try {
		const r = await fetch(`${API}/negotiations?lid=${lid}&mode=count`);
		if (!r.ok) return 0;
		const data = await r.json();
		return data.count;
	} catch {
		return 0;
	}
}

export async function flushReleasedPlayers(
	lid: number,
	releasedPlayers: any[],
	deleteRids: number[] = [],
): Promise<void> {
	if (!(await isAvailable())) return;
	try {
		await fetch(`${API}/released-players/flush`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ lid, releasedPlayers, deleteRids }),
		});
	} catch {}
}

export async function readAllReleasedPlayers(
	lid: number,
): Promise<any[] | null> {
	if (!(await isAvailable())) return null;
	try {
		const r = await fetch(`${API}/released-players?lid=${lid}`);
		if (!r.ok) return null;
		const data = await r.json();
		return data.releasedPlayers;
	} catch {
		return null;
	}
}

export async function countSqliteReleasedPlayers(lid: number): Promise<number> {
	if (!(await isAvailable())) return 0;
	try {
		const r = await fetch(`${API}/released-players?lid=${lid}&mode=count`);
		if (!r.ok) return 0;
		const data = await r.json();
		return data.count;
	} catch {
		return 0;
	}
}

export async function flushTrade(
	lid: number,
	trades: any[],
	deleteRids: number[] = [],
): Promise<void> {
	if (!(await isAvailable())) return;
	try {
		await fetch(`${API}/trade/flush`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ lid, trades, deleteRids }),
		});
	} catch {}
}

export async function readAllTrade(lid: number): Promise<any[] | null> {
	if (!(await isAvailable())) return null;
	try {
		const r = await fetch(`${API}/trade?lid=${lid}`);
		if (!r.ok) return null;
		const data = await r.json();
		return data.trades;
	} catch {
		return null;
	}
}

export async function countSqliteTrade(lid: number): Promise<number> {
	if (!(await isAvailable())) return 0;
	try {
		const r = await fetch(`${API}/trade?lid=${lid}&mode=count`);
		if (!r.ok) return 0;
		const data = await r.json();
		return data.count;
	} catch {
		return 0;
	}
}

export async function flushSavedTrades(
	lid: number,
	savedTrades: any[],
	deleteHashes: string[] = [],
): Promise<void> {
	if (!(await isAvailable())) return;
	try {
		await fetch(`${API}/saved-trades/flush`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ lid, savedTrades, deleteHashes }),
		});
	} catch {}
}

export async function readAllSavedTrades(lid: number): Promise<any[] | null> {
	if (!(await isAvailable())) return null;
	try {
		const r = await fetch(`${API}/saved-trades?lid=${lid}`);
		if (!r.ok) return null;
		const data = await r.json();
		return data.savedTrades;
	} catch {
		return null;
	}
}

export async function countSqliteSavedTrades(lid: number): Promise<number> {
	if (!(await isAvailable())) return 0;
	try {
		const r = await fetch(`${API}/saved-trades?lid=${lid}&mode=count`);
		if (!r.ok) return 0;
		const data = await r.json();
		return data.count;
	} catch {
		return 0;
	}
}

export async function flushSavedTradingBlock(
	lid: number,
	blocks: any[],
	deleteRids: number[] = [],
): Promise<void> {
	if (!(await isAvailable())) return;
	try {
		await fetch(`${API}/saved-trading-block/flush`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ lid, blocks, deleteRids }),
		});
	} catch {}
}

export async function readAllSavedTradingBlock(
	lid: number,
): Promise<any[] | null> {
	if (!(await isAvailable())) return null;
	try {
		const r = await fetch(`${API}/saved-trading-block?lid=${lid}`);
		if (!r.ok) return null;
		const data = await r.json();
		return data.blocks;
	} catch {
		return null;
	}
}

export async function countSqliteSavedTradingBlock(
	lid: number,
): Promise<number> {
	if (!(await isAvailable())) return 0;
	try {
		const r = await fetch(`${API}/saved-trading-block?lid=${lid}&mode=count`);
		if (!r.ok) return 0;
		const data = await r.json();
		return data.count;
	} catch {
		return 0;
	}
}

export async function flushMessages(
	lid: number,
	messages: any[],
	deleteMids: number[] = [],
): Promise<void> {
	if (!(await isAvailable())) return;
	try {
		await fetch(`${API}/messages/flush`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ lid, messages, deleteMids }),
		});
	} catch {}
}

export async function readMessages(
	lid: number,
	filter: { mid?: number; limit?: number } = {},
): Promise<any[] | null> {
	if (!(await isAvailable())) return null;
	try {
		const params = new URLSearchParams({ lid: String(lid) });
		if (filter.mid !== undefined) params.set("mid", String(filter.mid));
		else if (filter.limit !== undefined)
			params.set("limit", String(filter.limit));
		const r = await fetch(`${API}/messages?${params}`);
		if (!r.ok) return null;
		const data = await r.json();
		return data.messages;
	} catch {
		return null;
	}
}

export async function countSqliteMessages(lid: number): Promise<number> {
	if (!(await isAvailable())) return 0;
	try {
		const r = await fetch(`${API}/messages?lid=${lid}&mode=count`);
		if (!r.ok) return 0;
		const data = await r.json();
		return data.count;
	} catch {
		return 0;
	}
}

export async function getMaxMessageMid(lid: number): Promise<number> {
	if (!(await isAvailable())) return -1;
	try {
		const r = await fetch(`${API}/messages?lid=${lid}&mode=maxmid`);
		if (!r.ok) return -1;
		const data = await r.json();
		return data.maxMid ?? -1;
	} catch {
		return -1;
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

// ---- Phase 5B client functions ----------------------------------------

export async function flushAllStars(
	lid: number,
	allStars: any[],
	deleteSeasons: number[] = [],
): Promise<void> {
	if (!(await isAvailable())) return;
	try {
		await fetch(`${API}/all-stars/flush`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ lid, allStars, deleteSeasons }),
		});
	} catch {}
}
export async function readAllStars(
	lid: number,
	filter: { season?: number } = {},
): Promise<any[] | null> {
	if (!(await isAvailable())) return null;
	try {
		const params = new URLSearchParams({ lid: String(lid) });
		if (filter.season !== undefined)
			params.set("season", String(filter.season));
		const r = await fetch(`${API}/all-stars?${params}`);
		if (!r.ok) return null;
		return (await r.json()).allStars;
	} catch {
		return null;
	}
}
export async function countSqliteAllStars(lid: number): Promise<number> {
	if (!(await isAvailable())) return 0;
	try {
		const r = await fetch(`${API}/all-stars?lid=${lid}&mode=count`);
		if (!r.ok) return 0;
		return (await r.json()).count;
	} catch {
		return 0;
	}
}

export async function flushAwards(
	lid: number,
	awards: any[],
	deleteSeasons: number[] = [],
): Promise<void> {
	if (!(await isAvailable())) return;
	try {
		await fetch(`${API}/awards/flush`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ lid, awards, deleteSeasons }),
		});
	} catch {}
}
export async function readAwards(
	lid: number,
	filter: { season?: number } = {},
): Promise<any[] | null> {
	if (!(await isAvailable())) return null;
	try {
		const params = new URLSearchParams({ lid: String(lid) });
		if (filter.season !== undefined)
			params.set("season", String(filter.season));
		const r = await fetch(`${API}/awards?${params}`);
		if (!r.ok) return null;
		return (await r.json()).awards;
	} catch {
		return null;
	}
}
export async function countSqliteAwards(lid: number): Promise<number> {
	if (!(await isAvailable())) return 0;
	try {
		const r = await fetch(`${API}/awards?lid=${lid}&mode=count`);
		if (!r.ok) return 0;
		return (await r.json()).count;
	} catch {
		return 0;
	}
}

export async function flushDraftLotteryResults(
	lid: number,
	draftLotteryResults: any[],
	deleteSeasons: number[] = [],
): Promise<void> {
	if (!(await isAvailable())) return;
	try {
		await fetch(`${API}/draft-lottery-results/flush`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ lid, draftLotteryResults, deleteSeasons }),
		});
	} catch {}
}
export async function readDraftLotteryResults(
	lid: number,
	filter: { season?: number } = {},
): Promise<any[] | null> {
	if (!(await isAvailable())) return null;
	try {
		const params = new URLSearchParams({ lid: String(lid) });
		if (filter.season !== undefined)
			params.set("season", String(filter.season));
		const r = await fetch(`${API}/draft-lottery-results?${params}`);
		if (!r.ok) return null;
		return (await r.json()).draftLotteryResults;
	} catch {
		return null;
	}
}
export async function countSqliteDraftLotteryResults(
	lid: number,
): Promise<number> {
	if (!(await isAvailable())) return 0;
	try {
		const r = await fetch(`${API}/draft-lottery-results?lid=${lid}&mode=count`);
		if (!r.ok) return 0;
		return (await r.json()).count;
	} catch {
		return 0;
	}
}

export async function flushEvents(
	lid: number,
	events: any[],
	deleteEids: number[] = [],
): Promise<void> {
	if (!(await isAvailable())) return;
	try {
		await fetch(`${API}/events/flush`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ lid, events, deleteEids }),
		});
	} catch {}
}
export async function readEvents(
	lid: number,
	filter: { eid?: number; season?: number; pid?: number; dpid?: number } = {},
): Promise<any[] | null> {
	if (!(await isAvailable())) return null;
	try {
		const params = new URLSearchParams({ lid: String(lid) });
		if (filter.eid !== undefined) params.set("eid", String(filter.eid));
		else if (filter.season !== undefined)
			params.set("season", String(filter.season));
		else if (filter.pid !== undefined) params.set("pid", String(filter.pid));
		else if (filter.dpid !== undefined) params.set("dpid", String(filter.dpid));
		const r = await fetch(`${API}/events?${params}`);
		if (!r.ok) return null;
		return (await r.json()).events;
	} catch {
		return null;
	}
}
export async function countSqliteEvents(lid: number): Promise<number> {
	if (!(await isAvailable())) return 0;
	try {
		const r = await fetch(`${API}/events?lid=${lid}&mode=count`);
		if (!r.ok) return 0;
		return (await r.json()).count;
	} catch {
		return 0;
	}
}
export async function getMaxEventEid(lid: number): Promise<number> {
	if (!(await isAvailable())) return -1;
	try {
		const r = await fetch(`${API}/events?lid=${lid}&mode=maxeid`);
		if (!r.ok) return -1;
		return (await r.json()).maxEid ?? -1;
	} catch {
		return -1;
	}
}

export async function flushHeadToHeads(
	lid: number,
	headToHeads: any[],
	deleteSeasons: number[] = [],
): Promise<void> {
	if (!(await isAvailable())) return;
	try {
		await fetch(`${API}/head-to-heads/flush`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ lid, headToHeads, deleteSeasons }),
		});
	} catch {}
}
export async function readHeadToHeads(
	lid: number,
	filter: { season?: number } = {},
): Promise<any[] | null> {
	if (!(await isAvailable())) return null;
	try {
		const params = new URLSearchParams({ lid: String(lid) });
		if (filter.season !== undefined)
			params.set("season", String(filter.season));
		const r = await fetch(`${API}/head-to-heads?${params}`);
		if (!r.ok) return null;
		return (await r.json()).headToHeads;
	} catch {
		return null;
	}
}
export async function countSqliteHeadToHeads(lid: number): Promise<number> {
	if (!(await isAvailable())) return 0;
	try {
		const r = await fetch(`${API}/head-to-heads?lid=${lid}&mode=count`);
		if (!r.ok) return 0;
		return (await r.json()).count;
	} catch {
		return 0;
	}
}

export async function flushPlayerFeats(
	lid: number,
	playerFeats: any[],
	deleteFids: number[] = [],
): Promise<void> {
	if (!(await isAvailable())) return;
	try {
		await fetch(`${API}/player-feats/flush`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ lid, playerFeats, deleteFids }),
		});
	} catch {}
}
export async function readAllPlayerFeats(lid: number): Promise<any[] | null> {
	if (!(await isAvailable())) return null;
	try {
		const r = await fetch(`${API}/player-feats?lid=${lid}`);
		if (!r.ok) return null;
		return (await r.json()).playerFeats;
	} catch {
		return null;
	}
}
export async function countSqlitePlayerFeats(lid: number): Promise<number> {
	if (!(await isAvailable())) return 0;
	try {
		const r = await fetch(`${API}/player-feats?lid=${lid}&mode=count`);
		if (!r.ok) return 0;
		return (await r.json()).count;
	} catch {
		return 0;
	}
}
export async function getMaxPlayerFeatFid(lid: number): Promise<number> {
	if (!(await isAvailable())) return -1;
	try {
		const r = await fetch(`${API}/player-feats?lid=${lid}&mode=maxfid`);
		if (!r.ok) return -1;
		return (await r.json()).maxFid ?? -1;
	} catch {
		return -1;
	}
}

export async function flushPlayoffSeries(
	lid: number,
	playoffSeries: any[],
	deleteSeasons: number[] = [],
): Promise<void> {
	if (!(await isAvailable())) return;
	try {
		await fetch(`${API}/playoff-series/flush`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ lid, playoffSeries, deleteSeasons }),
		});
	} catch {}
}
export async function readAllPlayoffSeries(lid: number): Promise<any[] | null> {
	if (!(await isAvailable())) return null;
	try {
		const r = await fetch(`${API}/playoff-series?lid=${lid}`);
		if (!r.ok) return null;
		return (await r.json()).playoffSeries;
	} catch {
		return null;
	}
}
export async function countSqlitePlayoffSeries(lid: number): Promise<number> {
	if (!(await isAvailable())) return 0;
	try {
		const r = await fetch(`${API}/playoff-series?lid=${lid}&mode=count`);
		if (!r.ok) return 0;
		return (await r.json()).count;
	} catch {
		return 0;
	}
}

export async function flushScheduledEvents(
	lid: number,
	scheduledEvents: any[],
	deleteIds: number[] = [],
): Promise<void> {
	if (!(await isAvailable())) return;
	try {
		await fetch(`${API}/scheduled-events/flush`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ lid, scheduledEvents, deleteIds }),
		});
	} catch {}
}
export async function readScheduledEvents(
	lid: number,
	filter: { season?: number } = {},
): Promise<any[] | null> {
	if (!(await isAvailable())) return null;
	try {
		const params = new URLSearchParams({ lid: String(lid) });
		if (filter.season !== undefined)
			params.set("season", String(filter.season));
		const r = await fetch(`${API}/scheduled-events?${params}`);
		if (!r.ok) return null;
		return (await r.json()).scheduledEvents;
	} catch {
		return null;
	}
}
export async function countSqliteScheduledEvents(lid: number): Promise<number> {
	if (!(await isAvailable())) return 0;
	try {
		const r = await fetch(`${API}/scheduled-events?lid=${lid}&mode=count`);
		if (!r.ok) return 0;
		return (await r.json()).count;
	} catch {
		return 0;
	}
}
export async function getMaxScheduledEventId(lid: number): Promise<number> {
	if (!(await isAvailable())) return -1;
	try {
		const r = await fetch(`${API}/scheduled-events?lid=${lid}&mode=maxid`);
		if (!r.ok) return -1;
		return (await r.json()).maxId ?? -1;
	} catch {
		return -1;
	}
}

export async function flushSeasonLeaders(
	lid: number,
	seasonLeaders: any[],
	deleteSeasons: number[] = [],
): Promise<void> {
	if (!(await isAvailable())) return;
	try {
		await fetch(`${API}/season-leaders/flush`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ lid, seasonLeaders, deleteSeasons }),
		});
	} catch {}
}
export async function readSeasonLeaders(
	lid: number,
	filter: { fromSeason?: number } = {},
): Promise<any[] | null> {
	if (!(await isAvailable())) return null;
	try {
		const params = new URLSearchParams({ lid: String(lid) });
		if (filter.fromSeason !== undefined)
			params.set("fromSeason", String(filter.fromSeason));
		const r = await fetch(`${API}/season-leaders?${params}`);
		if (!r.ok) return null;
		return (await r.json()).seasonLeaders;
	} catch {
		return null;
	}
}
export async function countSqliteSeasonLeaders(lid: number): Promise<number> {
	if (!(await isAvailable())) return 0;
	try {
		const r = await fetch(`${API}/season-leaders?lid=${lid}&mode=count`);
		if (!r.ok) return 0;
		return (await r.json()).count;
	} catch {
		return 0;
	}
}

// ---- Meta DB client functions -----------------------------------------------

export async function metaGetAllLeagues(): Promise<any[] | null> {
	if (!(await isAvailable())) return null;
	try {
		const r = await fetch(`${API}/meta/leagues`);
		if (!r.ok) return null;
		return (await r.json()).leagues;
	} catch {
		return null;
	}
}

export async function metaGetLeague(lid: number): Promise<any | null> {
	if (!(await isAvailable())) return null;
	try {
		const r = await fetch(`${API}/meta/league?lid=${lid}`);
		if (!r.ok) return null;
		return (await r.json()).league;
	} catch {
		return null;
	}
}

export async function metaGetMaxLeagueLid(): Promise<number | null> {
	if (!(await isAvailable())) return null;
	try {
		const r = await fetch(`${API}/meta/league/maxlid`);
		if (!r.ok) return null;
		return (await r.json()).maxLid;
	} catch {
		return null;
	}
}

export async function metaPutLeague(league: any): Promise<void> {
	if (!(await isAvailable())) return;
	try {
		await fetch(`${API}/meta/league`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ league }),
		});
	} catch {}
}

export async function metaDeleteLeague(lid: number): Promise<void> {
	if (!(await isAvailable())) return;
	try {
		await fetch(`${API}/meta/league?lid=${lid}`, { method: "DELETE" });
	} catch {}
}

export async function metaClearLeagues(): Promise<void> {
	if (!(await isAvailable())) return;
	try {
		await fetch(`${API}/meta/leagues`, { method: "DELETE" });
	} catch {}
}

export async function metaGetAttribute(key: string): Promise<any> {
	if (!(await isAvailable())) return undefined;
	try {
		const r = await fetch(
			`${API}/meta/attribute?key=${encodeURIComponent(key)}`,
		);
		if (!r.ok) return undefined;
		const data = await r.json();
		return data.found ? data.value : undefined;
	} catch {
		return undefined;
	}
}

export async function metaPutAttribute(key: string, value: any): Promise<void> {
	if (!(await isAvailable())) return;
	try {
		await fetch(`${API}/meta/attribute`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ key, value }),
		});
	} catch {}
}

export async function metaDeleteAttribute(key: string): Promise<void> {
	if (!(await isAvailable())) return;
	try {
		await fetch(`${API}/meta/attribute?key=${encodeURIComponent(key)}`, {
			method: "DELETE",
		});
	} catch {}
}

export async function metaGetAllAchievements(): Promise<
	{ id: number; slug: string; difficulty: string }[] | null
> {
	if (!(await isAvailable())) return null;
	try {
		const r = await fetch(`${API}/meta/achievements`);
		if (!r.ok) return null;
		return (await r.json()).achievements;
	} catch {
		return null;
	}
}

export async function metaAddAchievements(
	achievements: { slug: string; difficulty: string }[],
): Promise<void> {
	if (!(await isAvailable())) return;
	try {
		await fetch(`${API}/meta/achievements`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ achievements }),
		});
	} catch {}
}

export async function metaClearAchievements(): Promise<void> {
	if (!(await isAvailable())) return;
	try {
		await fetch(`${API}/meta/achievements`, { method: "DELETE" });
	} catch {}
}
