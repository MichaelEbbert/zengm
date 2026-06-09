import type { Game } from "../../../common/types.ts";
import { getSqliteDb } from "../../db/sqlite.ts";
import {
	TEAM_STAT_KEYS,
	PLAYER_STAT_KEYS,
	TEAM_STAT_COLS,
	PLAYER_STAT_COLS,
} from "../../db/sqliteGameKeys.ts";

const GAME_COLS = [
	"gid",
	"season",
	"day",
	"att",
	"overtimes",
	"num_periods",
	"playoffs",
	"finals",
	"neutral_site",
	"won_tid",
	"won_pts",
	"lost_tid",
	"lost_pts",
];

const TEAM_FIXED_COLS = [
	"gid",
	"tid",
	"pts",
	"pts_qtrs",
	"ovr",
	"won",
	"lost",
	"tied",
	"otl",
	"playoff_seed",
	"playoff_won",
	"playoff_lost",
];
const TEAM_COLS = [...TEAM_FIXED_COLS, ...TEAM_STAT_COLS];

const PLAYER_FIXED_COLS = [
	"gid",
	"tid",
	"pid",
	"name",
	"pos",
	"skills",
	"injury_type",
	"injury_games_remaining",
	"injury_new_this_game",
	"injury_playing_through",
	"injury_at_start",
];
const PLAYER_COLS = [...PLAYER_FIXED_COLS, ...PLAYER_STAT_COLS];

const SCORING_COLS = [
	"gid",
	"seq",
	"quarter",
	"clock",
	"tid",
	"pid",
	"passer_pid",
	"yds",
	"play_type",
	"made",
	"pts_scored",
];

const buildInsert = (table: string, cols: string[]) =>
	`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map((c) => "@" + c).join(", ")})`;

// Play type remapping for TD events
const TD_TYPE_MAP: Record<string, string> = {
	run: "run",
	pass: "pass",
	kickoffReturn: "kickoff_return",
	puntReturn: "punt_return",
	fumbleRecovery: "fumble_recovery",
	interception: "interception",
};

// Prepared statements cached after first use
let stmts: {
	insertGame: any;
	insertTeam: any;
	insertPlayer: any;
	insertScoringPlay: any;
} | null = null;

async function getStmts() {
	const db = await getSqliteDb();
	if (!db) return null;

	if (!stmts) {
		stmts = {
			insertGame: db.prepare(buildInsert("games", GAME_COLS)),
			insertTeam: db.prepare(buildInsert("game_teams", TEAM_COLS)),
			insertPlayer: db.prepare(buildInsert("game_players", PLAYER_COLS)),
			insertScoringPlay: db.prepare(
				buildInsert("game_scoring_plays", SCORING_COLS),
			),
		};
	}

	return { db, ...stmts };
}

export async function writeGameToSqlite(gameStats: Game): Promise<void> {
	const s = await getStmts();
	if (!s) return;

	const { db, insertGame, insertTeam, insertPlayer, insertScoringPlay } = s;

	// name → pid map for scoring play lookups
	const nameToPid = new Map<string, number>();
	for (const team of gameStats.teams) {
		for (const player of team.players) {
			nameToPid.set(player.name, player.pid);
		}
	}

	(
		db.transaction(() => {
			// games
			insertGame.run({
				gid: gameStats.gid,
				season: gameStats.season,
				day: gameStats.day ?? null,
				att: gameStats.att,
				overtimes: gameStats.overtimes,
				num_periods: gameStats.numPeriods ?? 4,
				playoffs: gameStats.playoffs ? 1 : 0,
				finals: gameStats.finals ? 1 : 0,
				neutral_site: gameStats.neutralSite ? 1 : 0,
				won_tid: gameStats.won.tid,
				won_pts: gameStats.won.pts,
				lost_tid: gameStats.lost.tid,
				lost_pts: gameStats.lost.pts,
			});

			// game_teams (2 rows)
			for (const team of gameStats.teams) {
				const row: Record<string, any> = {
					gid: gameStats.gid,
					tid: team.tid,
					pts: team.pts,
					pts_qtrs: JSON.stringify((team as any).ptsQtrs ?? []),
					ovr: team.ovr ?? null,
					won: team.won ?? null,
					lost: team.lost ?? null,
					tied: team.tied ?? null,
					otl: team.otl ?? null,
					playoff_seed: team.playoffs?.seed ?? null,
					playoff_won: team.playoffs?.won ?? null,
					playoff_lost: team.playoffs?.lost ?? null,
				};
				for (let i = 0; i < TEAM_STAT_KEYS.length; i++) {
					row[TEAM_STAT_COLS[i]!] = (team as any)[TEAM_STAT_KEYS[i]!] ?? null;
				}
				insertTeam.run(row);
			}

			// game_players (1 row per player per team)
			for (const team of gameStats.teams) {
				for (const player of team.players) {
					const row: Record<string, any> = {
						gid: gameStats.gid,
						tid: team.tid,
						pid: player.pid,
						name: player.name,
						pos: player.pos ?? null,
						skills: JSON.stringify(player.skills ?? []),
						injury_type: player.injury?.type ?? null,
						injury_games_remaining: player.injury?.gamesRemaining ?? null,
						injury_new_this_game: player.injury?.newThisGame ? 1 : null,
						injury_playing_through: player.injury?.playingThrough ? 1 : null,
						injury_at_start: player.injuryAtStart ?? null,
					};
					for (let i = 0; i < PLAYER_STAT_KEYS.length; i++) {
						row[PLAYER_STAT_COLS[i]!] = player[PLAYER_STAT_KEYS[i]!] ?? null;
					}
					insertPlayer.run(row);
				}
			}

			// game_scoring_plays
			const scoringSummary: any[] = (gameStats as any).scoringSummary ?? [];
			for (const [seq, event] of scoringSummary.entries()) {
				const names: string[] = event.names ?? [];
				const t: number = event.t ?? 0;
				let playType: string;
				let ptsScored: number;
				let pid: number | null = null;
				let passerPid: number | null = null;
				let yds: number | null = event.yds ?? null;
				let made: number | null = null;
				let tid: number | null = gameStats.teams[t]?.tid ?? null;

				if (event.type === "fieldGoal") {
					playType = "field_goal";
					made = event.made ? 1 : 0;
					ptsScored = event.made ? 3 : 0;
					pid =
						names[0] !== undefined ? (nameToPid.get(names[0]) ?? null) : null;
				} else if (event.type === "extraPoint") {
					playType = "extra_point";
					made = event.made ? 1 : 0;
					ptsScored = event.made ? 1 : 0;
					pid =
						names[0] !== undefined ? (nameToPid.get(names[0]) ?? null) : null;
					yds = null;
				} else if (event.type === "twoPointConversionFailed") {
					playType = "two_point_failed";
					ptsScored = 0;
					yds = null;
				} else if (event.type === "shootoutShot") {
					playType = "shootout_shot";
					made = event.made ? 1 : 0;
					ptsScored = event.made ? 1 : 0;
					pid =
						names[0] !== undefined ? (nameToPid.get(names[0]) ?? null) : null;
					yds = null;
				} else if (event.safety) {
					// Defending team gets safety points; t is the offense
					tid = gameStats.teams[1 - t]?.tid ?? null;
					playType = "safety";
					ptsScored = 2;
					yds = null;
				} else if (event.td) {
					playType = TD_TYPE_MAP[event.type] ?? event.type;
					ptsScored = 6;
					if (event.type === "pass") {
						passerPid =
							names[0] !== undefined ? (nameToPid.get(names[0]) ?? null) : null;
						pid =
							names[1] !== undefined ? (nameToPid.get(names[1]) ?? null) : null;
					} else {
						pid =
							names[0] !== undefined ? (nameToPid.get(names[0]) ?? null) : null;
					}
				} else {
					continue;
				}

				insertScoringPlay.run({
					gid: gameStats.gid,
					seq,
					quarter: event.quarter,
					clock: event.clock,
					tid,
					pid,
					passer_pid: passerPid,
					yds,
					play_type: playType,
					made,
					pts_scored: ptsScored,
				});
			}
		}) as any
	)();
}
