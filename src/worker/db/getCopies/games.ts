import type { Game, GetCopyType } from "../../../common/types.ts";
import { readGames as electronReadGames } from "../electronApi.ts";
import { g } from "../../util/index.ts";
import {
	TEAM_STAT_KEYS,
	PLAYER_STAT_KEYS,
	TEAM_STAT_COLS,
	PLAYER_STAT_COLS,
} from "../sqliteGameKeys.ts";

// Reverse type mapping for scoring summary reconstruction
const PLAY_TYPE_META: Record<
	string,
	{ type: string; td?: true; safety?: true }
> = {
	run: { type: "run", td: true },
	pass: { type: "pass", td: true },
	kickoff_return: { type: "kickoffReturn", td: true },
	punt_return: { type: "puntReturn", td: true },
	fumble_recovery: { type: "fumbleRecovery", td: true },
	interception: { type: "interception", td: true },
	field_goal: { type: "fieldGoal" },
	extra_point: { type: "extraPoint" },
	two_point_failed: { type: "twoPointConversionFailed" },
	shootout_shot: { type: "shootoutShot" },
	safety: { type: "sack", safety: true },
};

function assembleGames(
	gameRows: any[],
	teamRows: any[],
	playerRows: any[],
	scoringRows: any[],
): Game[] {
	const teamsByGid = new Map<number, any[]>();
	for (const r of teamRows) {
		let a = teamsByGid.get(r.gid);
		if (!a) {
			a = [];
			teamsByGid.set(r.gid, a);
		}
		a.push(r);
	}

	const playersByGid = new Map<number, any[]>();
	for (const r of playerRows) {
		let a = playersByGid.get(r.gid);
		if (!a) {
			a = [];
			playersByGid.set(r.gid, a);
		}
		a.push(r);
	}

	const scoringByGid = new Map<number, any[]>();
	for (const r of scoringRows) {
		let a = scoringByGid.get(r.gid);
		if (!a) {
			a = [];
			scoringByGid.set(r.gid, a);
		}
		a.push(r);
	}

	return gameRows.map((row) => {
		const gid: number = row.gid;
		const myTeams = teamsByGid.get(gid) ?? [];
		const myPlayers = playersByGid.get(gid) ?? [];
		const myScoring = scoringByGid.get(gid) ?? [];

		// Build pid → name for scoring summary name reconstruction
		const pidToName = new Map<number, string>();
		for (const p of myPlayers) {
			if (p.pid !== null && p.name) pidToName.set(p.pid, p.name);
		}

		// Reconstruct teams in insertion order (rowid order = team index 0 then 1)
		const teams = myTeams.map((tr: any) => {
			const team: Record<string, any> = {
				tid: tr.tid,
				pts: tr.pts,
				ptsQtrs: JSON.parse(tr.pts_qtrs ?? "[]"),
			};
			if (tr.ovr !== null) team.ovr = tr.ovr;
			if (tr.won !== null) team.won = tr.won;
			if (tr.lost !== null) team.lost = tr.lost;
			if (tr.tied !== null) team.tied = tr.tied;
			if (tr.otl !== null) team.otl = tr.otl;
			if (tr.playoff_seed !== null) {
				team.playoffs = {
					seed: tr.playoff_seed,
					won: tr.playoff_won,
					lost: tr.playoff_lost,
				};
			}
			for (let i = 0; i < TEAM_STAT_KEYS.length; i++) {
				const v = tr[TEAM_STAT_COLS[i]!];
				if (v !== null && v !== undefined) team[TEAM_STAT_KEYS[i]!] = v;
			}
			team.players = myPlayers
				.filter((p: any) => p.tid === tr.tid)
				.map((pr: any) => {
					const player: Record<string, any> = {
						pid: pr.pid,
						name: pr.name,
						pos: pr.pos ?? "",
						skills: JSON.parse(pr.skills ?? "[]"),
						injury: {
							type: pr.injury_type ?? "Healthy",
							gamesRemaining: pr.injury_games_remaining ?? 0,
							...(pr.injury_new_this_game ? { newThisGame: true } : {}),
							...(pr.injury_playing_through ? { playingThrough: true } : {}),
						},
					};
					if (pr.injury_at_start !== null) {
						player.injuryAtStart = JSON.parse(pr.injury_at_start);
					}
					for (let i = 0; i < PLAYER_STAT_KEYS.length; i++) {
						const v = pr[PLAYER_STAT_COLS[i]!];
						if (v !== null && v !== undefined) player[PLAYER_STAT_KEYS[i]!] = v;
					}
					return player;
				});
			return team;
		});

		// tid → team index (0 or 1) for scoring summary
		const tidToIdx = new Map<number, number>();
		for (let i = 0; i < teams.length; i++) {
			tidToIdx.set(teams[i]!.tid, i);
		}

		const scoringSummary = myScoring.map((sr: any) => {
			const meta = PLAY_TYPE_META[sr.play_type] ?? { type: sr.play_type };

			// Safety: tid stored = defending team; event.t should be offense index
			let t: number;
			if (sr.play_type === "safety") {
				const defendingIdx = tidToIdx.get(sr.tid) ?? 0;
				t = 1 - defendingIdx;
			} else {
				t = tidToIdx.get(sr.tid) ?? 0;
			}

			const names: string[] = [];
			if (sr.play_type === "pass") {
				names.push(
					sr.passer_pid !== null ? (pidToName.get(sr.passer_pid) ?? "") : "",
				);
				names.push(sr.pid !== null ? (pidToName.get(sr.pid) ?? "") : "");
			} else if (sr.pid !== null) {
				names.push(pidToName.get(sr.pid) ?? "");
			}

			const event: Record<string, any> = {
				...meta,
				t,
				quarter: sr.quarter,
				clock: sr.clock,
				names,
			};
			if (sr.yds !== null) event.yds = sr.yds;
			if (sr.made !== null) event.made = sr.made === 1;
			return event;
		});

		const game: Record<string, any> = {
			gid: row.gid,
			season: row.season,
			att: row.att,
			overtimes: row.overtimes,
			numPeriods: row.num_periods,
			won: { tid: row.won_tid, pts: row.won_pts },
			lost: { tid: row.lost_tid, pts: row.lost_pts },
			teams,
			scoringSummary,
		};
		if (row.day !== null) game.day = row.day;
		if (row.playoffs === 1) game.playoffs = true;
		if (row.finals === 1) game.finals = true;
		if (row.neutral_site === 1) game.neutralSite = true;
		return game as Game;
	});
}

const getCopies = async (
	{
		gid,
		note,
		season,
	}: {
		gid?: number;
		note?: boolean;
		season?: number;
	} = {},
	type?: GetCopyType,
): Promise<Game[]> => {
	if (!note) {
		let lid: number | undefined;
		try {
			lid = g.get("lid") as number;
		} catch {}
		if (typeof lid === "number") {
			const rows = await electronReadGames(lid, { gid, season });
			if (rows !== null) {
				return assembleGames(
					rows.gameRows,
					rows.teamRows,
					rows.playerRows,
					rows.scoringRows,
				);
			}
		}
	}

	return [];
};

export default getCopies;
