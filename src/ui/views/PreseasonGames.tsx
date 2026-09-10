import { useState } from "react";
import useTitleBar from "../hooks/useTitleBar.tsx";
import { toWorker } from "../util/toWorker.ts";
import type { View } from "../../common/types.ts";

const PreseasonGames = ({ weeks, season, userTid }: View<"preseasonGames">) => {
	const [simming, setSimming] = useState<string | undefined>();

	useTitleBar({
		title: "Preseason Games",
		titleLong: `Preseason Games » ${season}`,
	});

	return (
		<>
			<p>
				Exhibition games that count for nothing. Both teams run their depth
				charts backwards, so the players buried at the bottom start and play the
				whole game — a look at your draft picks and reserves that the regular
				season never gives you.
			</p>
			<p>
				Every team plays once a week, against a different opponent each week.
				Nothing is saved but the final score: no stats, no standings, no
				injuries. Each game can be watched once.
			</p>

			<div className="row">
				{weeks.map(({ week, games }) => (
					<div key={week} className="col-12 col-lg-4 mb-3">
						<h3>Week {week}</h3>
						<ul className="list-group">
							{games.map((g) => {
								const key = `${week}-${g.idx}`;
								const involvesUser =
									g.home.tid === userTid || g.away.tid === userTid;

								return (
									<li
										key={g.idx}
										className={`list-group-item d-flex justify-content-between align-items-center${
											involvesUser ? " list-group-item-info" : ""
										}`}
									>
										<span>
											{g.away.abbrev} @ {g.home.abbrev}
										</span>

										{g.played ? (
											<span className="text-body-secondary">
												{g.awayPts}–{g.homePts}
											</span>
										) : (
											<button
												className="btn btn-sm btn-primary"
												disabled={simming !== undefined}
												onClick={async () => {
													setSimming(key);
													try {
														await toWorker(
															"preseasonGames",
															"simPreseasonGame",
															{ week, idx: g.idx },
														);
													} finally {
														setSimming(undefined);
													}
												}}
											>
												{simming === key ? "Simming..." : "Watch"}
											</button>
										)}
									</li>
								);
							})}
						</ul>
					</div>
				))}
			</div>
		</>
	);
};

export default PreseasonGames;
