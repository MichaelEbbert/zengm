import { useState, type SubmitEvent, type ChangeEvent } from "react";
import useTitleBar from "../hooks/useTitleBar.tsx";
import { helpers } from "../util/helpers.ts";
import { logEvent } from "../util/logEvent.ts";
import { toWorker } from "../util/toWorker.ts";
import { ActionButton } from "../components/ActionButton.tsx";
import { confirm } from "../util/confirm.tsx";

const LABELS = {
	boxScores: "ALL box scores, including this season's",
	events: "all news feed entries",
	teamStats: "old team stats",
	teamHistory: "old team history",
	retiredPlayersUnnotable: "unnotable retired players",
	retiredPlayers: "all retired players",
	playerStatsUnnotable: "unnotable player info",
	playerStats: "old player info",
};

const DeleteOldData = () => {
	const [state, setState] = useState({
		boxScores: false,
		events: false,
		teamStats: false,
		teamHistory: false,
		retiredPlayersUnnotable: false,
		retiredPlayers: false,
		playerStatsUnnotable: false,
		playerStats: false,
	});
	const [deleting, setDeleting] = useState(false);

	const handleChange =
		(name: keyof typeof state) => (event: ChangeEvent<HTMLInputElement>) => {
			setState({
				...state,
				[name]: event.target.checked,
			});
		};

	const handleSubmit = async (event: SubmitEvent) => {
		event.preventDefault();

		const selected = helpers
			.keys(state)
			.filter((key) => state[key])
			.map((key) => LABELS[key]);
		if (selected.length === 0) {
			return;
		}

		const sure = await confirm(
			`Are you sure? This will permanently delete: ${selected.join("; ")}.`,
			{ okText: "Yes, continue", cancelText: "Cancel" },
		);
		if (!sure) {
			return;
		}

		const lastChance = await confirm(
			"OK, last chance to bail. There is no undo -- this data is gone for good. Type DELETE to confirm.",
			{ defaultValue: "", okText: "Delete", cancelText: "Bail out" },
		);
		if (lastChance === null) {
			return;
		}
		if (lastChance !== "DELETE") {
			logEvent({
				type: "error",
				text: "Nothing deleted -- you must type DELETE exactly.",
				saveToDb: false,
			});
			return;
		}

		setDeleting(true);

		await toWorker("main", "deleteOldData", state);

		logEvent({
			type: "success",
			text: "Data successfully deleted.",
			saveToDb: false,
		});
		setDeleting(false);
	};

	useTitleBar({ title: "Delete Old Data" });

	return (
		<div style={{ maxWidth: 600 }}>
			<p>
				As you play multiple seasons in a league, the database can grow quite
				large. This used to slow down performance, but doesn't much anymore.
				However it does still use up hard drive space, which you can reclaim
				here by deleting old data from this league.
			</p>

			<div className="d-flex gap-2 mb-3">
				<button
					className="btn btn-secondary"
					onClick={() => {
						const newState = {
							...state,
						};
						for (const key of helpers.keys(newState)) {
							newState[key] = true;
						}
						setState(newState);
					}}
				>
					Select all
				</button>
				<button
					className="btn btn-secondary"
					onClick={() => {
						const newState = {
							...state,
						};
						for (const key of helpers.keys(newState)) {
							newState[key] = false;
						}
						setState(newState);
					}}
				>
					Clear
				</button>
			</div>

			<form onSubmit={handleSubmit}>
				<div className="form-check">
					<label className="form-check-label">
						<input
							className="form-check-input"
							onChange={handleChange("boxScores")}
							type="checkbox"
							checked={state.boxScores}
						/>
						Delete ALL Box Scores (every season, including this one -- this
						league keeps every box score unless you delete them here)
					</label>
				</div>
				<div className="form-check">
					<label className="form-check-label">
						<input
							className="form-check-input"
							onChange={handleChange("teamStats")}
							type="checkbox"
							checked={state.teamStats}
						/>
						Delete Old Team Stats
					</label>
				</div>
				<div className="form-check">
					<label className="form-check-label">
						<input
							className="form-check-input"
							onChange={handleChange("teamHistory")}
							type="checkbox"
							checked={state.teamHistory}
						/>
						Delete Old Team History (stuff like W/L, finances, etc)
					</label>
				</div>
				<div className="form-check">
					<label className="form-check-label">
						<input
							className="form-check-input"
							onChange={handleChange("retiredPlayersUnnotable")}
							type="checkbox"
							checked={state.retiredPlayersUnnotable}
						/>
						Delete Unnotable Retired Players
						<br />
						<i>Won't delete your past players or players who have won awards</i>
					</label>
				</div>
				<div className="form-check">
					<label className="form-check-label">
						<input
							className="form-check-input"
							onChange={handleChange("retiredPlayers")}
							type="checkbox"
							checked={state.retiredPlayers}
						/>
						Delete All Retired Players
					</label>
				</div>
				<div className="form-check">
					<label className="form-check-label">
						<input
							className="form-check-input"
							onChange={handleChange("playerStatsUnnotable")}
							type="checkbox"
							checked={state.playerStatsUnnotable}
						/>
						Delete Unnotable Player Info (stats, ratings, salaries, injuries)
						<br />
						<i>Won't delete your past players or players who have won awards</i>
					</label>
				</div>
				<div className="form-check">
					<label className="form-check-label">
						<input
							className="form-check-input"
							onChange={handleChange("playerStats")}
							type="checkbox"
							checked={state.playerStats}
						/>
						Delete Old Player Info (stats, ratings, salaries, injuries)
					</label>
				</div>
				<div className="form-check">
					<label className="form-check-label">
						<input
							className="form-check-input"
							onChange={handleChange("events")}
							type="checkbox"
							checked={state.events}
						/>
						Delete All News Feed Entries
					</label>
				</div>

				<p className="alert alert-danger mt-3">
					<b>Warning!</b> Once you delete old data, it's completely gone!
					There's no going back! This can impact your players making the Hall of
					Fame and the completion of in-progress achievements!
				</p>

				<ActionButton
					processing={deleting}
					processingText="Deleting"
					type="submit"
					variant="danger"
				>
					Delete Old Data
				</ActionButton>
			</form>
		</div>
	);
};

export default DeleteOldData;
