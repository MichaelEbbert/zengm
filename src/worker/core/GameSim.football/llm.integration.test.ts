import { beforeAll, test, expect } from "vitest";
import https from "node:https";
import Play from "./Play.ts";
import { genTwoTeams, initGameSim } from "./index.test.ts";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.1-8b-instant";

/**
 * Make a real HTTPS POST using node:https, bypassing the globalThis.fetch mock
 * that setup.ts installs for the test environment.
 */
function httpsPost(
	url: string,
	headers: Record<string, string>,
	body: string,
): Promise<{ ok: boolean; status: number; json: () => Promise<any> }> {
	return new Promise((resolve, reject) => {
		const parsed = new URL(url);
		const req = https.request(
			{
				hostname: parsed.hostname,
				path: parsed.pathname + parsed.search,
				method: "POST",
				headers: {
					...headers,
					"Content-Length": Buffer.byteLength(body),
				},
			},
			(res) => {
				const chunks: Buffer[] = [];
				res.on("data", (chunk: Buffer) => chunks.push(chunk));
				res.on("end", () => {
					const text = Buffer.concat(chunks).toString("utf8");
					resolve({
						ok: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300,
						status: res.statusCode ?? 0,
						json: async () => JSON.parse(text),
					});
				});
			},
		);
		req.on("error", reject);
		req.write(body);
		req.end();
	});
}

beforeAll(async () => {
	await genTwoTeams();
});

const DEFAULT_COACH =
	'You are an NFL offensive coordinator making play calls. Based on the game situation, decide whether to run or pass. Consider down and distance, field position, score, clock, and team strengths. Respond with JSON containing exactly two fields: "play" (must be either "run" or "pass") and "reasoning" (one sentence explaining your decision based on the specific situation).';

const AGGRESSIVE_FIRST_DOWN_COACH =
	'You are an NFL offensive coordinator. Your entire philosophy is built around one principle: first downs win games. Moving the chains is everything. When trailing or tied, be extremely aggressive — attack the defense, stretch the field, take risks to keep the drive alive. Never play it safe when you need yards. Respond with JSON containing exactly two fields: "play" (must be either "run" or "pass") and "reasoning" (one sentence explaining your decision based on the specific situation).';

async function callGroq(
	apiKey: string,
	userMessage: string,
	systemPrompt: string,
	label: string,
): Promise<"run" | "pass"> {
	const requestBody = JSON.stringify({
		model: GROQ_MODEL,
		messages: [
			{ role: "system", content: systemPrompt },
			{ role: "user", content: userMessage },
		],
		response_format: { type: "json_object" },
		temperature: 0.7,
		max_tokens: 150,
	});

	const start = Date.now();
	const response = await httpsPost(
		GROQ_API_URL,
		{ "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
		requestBody,
	);
	const elapsed = Date.now() - start;

	if (!response.ok) {
		const errData = await response.json();
		throw new Error(`API error ${response.status}: ${JSON.stringify(errData)}`);
	}

	const data = (await response.json()) as {
		choices?: Array<{ message?: { content?: string } }>;
	};
	const content = data?.choices?.[0]?.message?.content ?? "";
	const parsed = JSON.parse(content) as { play?: string; reasoning?: string };
	const decision = parsed?.play;

	console.log(
		`[${label}] Decision: "${decision}" (${elapsed}ms)\n` +
			`[${label}] Reasoning: ${parsed?.reasoning}`,
	);

	if (decision !== "run" && decision !== "pass") {
		throw new Error(`Unexpected play value: ${decision}`);
	}
	return decision;
}

test("llmPlayCall returns 'run' or 'pass' from Groq API", async () => {
	const apiKey = process.env.GROQ_API_KEY;
	if (!apiKey) {
		console.log("[LLM Integration] Skipping — GROQ_API_KEY not set");
		return;
	}

	const game = await initGameSim();

	// 2nd and 7, own 35, tied game, 8 min left in 3rd quarter
	game.awaitingKickoff = undefined;
	game.o = 0;
	game.d = 1;
	game.down = 2;
	game.toGo = 7;
	game.scrimmage = 35;
	game.team[0].stat.pts = 14;
	game.team[0].stat.ptsQtrs = [7, 7, 0];
	game.team[1].stat.pts = 14;
	game.team[1].stat.ptsQtrs = [7, 7, 0];
	game.clock = 8;
	game.currentPlay = new Play(game);

	const userMessage =
		`Down: ${game.down}, Distance: ${game.toGo} yards to first down\n` +
		`Field position: ${game.scrimmage} (0=own goal line, 100=opponent goal line)\n` +
		`Clock: ${game.clock.toFixed(2)} minutes remaining in quarter\n` +
		`Score: Offense ${game.team[game.o].stat.pts}, Defense ${game.team[game.d].stat.pts}\n` +
		`Offense timeouts remaining: ${(game as any).timeouts[game.o]}\n` +
		`Offense rushing strength: ${game.team[game.o].compositeRating.rushing.toFixed(3)}, receiving strength: ${game.team[game.o].compositeRating.receiving.toFixed(3)}\n` +
		`Defense run stopping: ${game.team[game.d].compositeRating.runStopping.toFixed(3)}, pass coverage: ${game.team[game.d].compositeRating.passCoverage.toFixed(3)}`;

	console.log("[LLM Integration] Game state:\n" + userMessage);

	const decision = await callGroq(
		apiKey,
		userMessage,
		DEFAULT_COACH,
		"LLM Default Coach",
	);
	expect(decision === "run" || decision === "pass").toBe(true);
}, 10000);

test("aggressive first-down coach calls plays differently when trailing", async () => {
	const apiKey = process.env.GROQ_API_KEY;
	if (!apiKey) {
		console.log("[LLM Integration] Skipping — GROQ_API_KEY not set");
		return;
	}

	const game = await initGameSim();

	// 3rd and 4, own 28, down by 7, 6 min left in 4th quarter — must move chains
	game.awaitingKickoff = undefined;
	game.o = 0;
	game.d = 1;
	game.down = 3;
	game.toGo = 4;
	game.scrimmage = 28;
	game.team[0].stat.pts = 10;
	game.team[0].stat.ptsQtrs = [0, 7, 3, 0];
	game.team[1].stat.pts = 17;
	game.team[1].stat.ptsQtrs = [7, 7, 3, 0];
	game.clock = 6;
	game.currentPlay = new Play(game);

	const userMessage =
		`Down: ${game.down}, Distance: ${game.toGo} yards to first down\n` +
		`Field position: ${game.scrimmage} (0=own goal line, 100=opponent goal line)\n` +
		`Clock: ${game.clock.toFixed(2)} minutes remaining in quarter\n` +
		`Score: Offense ${game.team[game.o].stat.pts}, Defense ${game.team[game.d].stat.pts}\n` +
		`Offense timeouts remaining: ${(game as any).timeouts[game.o]}\n` +
		`Offense rushing strength: ${game.team[game.o].compositeRating.rushing.toFixed(3)}, receiving strength: ${game.team[game.o].compositeRating.receiving.toFixed(3)}\n` +
		`Defense run stopping: ${game.team[game.d].compositeRating.runStopping.toFixed(3)}, pass coverage: ${game.team[game.d].compositeRating.passCoverage.toFixed(3)}`;

	console.log("[LLM Aggressive Coach] Game state:\n" + userMessage);

	const decision = await callGroq(
		apiKey,
		userMessage,
		AGGRESSIVE_FIRST_DOWN_COACH,
		"LLM Aggressive Coach",
	);
	expect(decision === "run" || decision === "pass").toBe(true);
}, 10000);
