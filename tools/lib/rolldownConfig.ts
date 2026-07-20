import path from "node:path";
import type { BuildOptions } from "rolldown";
import { type Sport } from "./getSport.ts";
// @ts-expect-error
import blacklist from "rollup-plugin-blacklist";
import { visualizer } from "rollup-plugin-visualizer";
import { modulepreload } from "./rolldownPlugins/modulepreload.ts";
import { sportFunctions } from "./rolldownPlugins/sportFunctions.ts";
import { startEnd } from "./rolldownPlugins/startEnd.ts";

export const FOLDER = "gen";

export const rolldownConfig = (
	sport: Sport,
	name: "ui" | "worker",
	envOptions:
		| {
				nodeEnv: "development";
				postMessage: (message: unknown) => void;
				signal: AbortSignal;
		  }
		| {
				nodeEnv: "production";
				blacklistOptions: RegExp[];
				onModulepreloadFilenames: (filenames: string[]) => void;
				versionNumber: string;
		  }
		| {
				nodeEnv: "test";
		  },
): BuildOptions => {
	const infile = path.join(
		"src",
		name,
		`index.${name === "ui" ? "tsx" : "ts"}`,
	);

	const plugins: BuildOptions["plugins"] = [
		sportFunctions(envOptions.nodeEnv, sport),
	];

	if (envOptions.nodeEnv === "development") {
		plugins.push(
			startEnd({
				name,
				postMessage: envOptions.postMessage,
				signal: envOptions.signal,
			}),
		);
	} else if (envOptions.nodeEnv === "production") {
		plugins.push(
			blacklist(envOptions.blacklistOptions),
			modulepreload(envOptions.onModulepreloadFilenames),
		);
		if (process.env.VISUALIZE) {
			plugins.push(
				visualizer({
					filename: `stats-${name}.html`,
					gzipSize: true,
					sourcemap: true,
					template: "sunburst",
				}),
			);
		}
	}

	return {
		input: infile,
		output: {
			entryFileNames:
				envOptions.nodeEnv === "production"
					? `${name}-${envOptions.versionNumber}.js`
					: `${name}.js`,
			chunkFileNames: `${name}-chunk-[hash].js`,
			dir: path.join("build", FOLDER),
			sourcemap: true,
			externalLiveBindings: false,
			format: "es",
			minify: true,
			comments: false,
		},
		transform: {
			define: {
				"process.env.NODE_ENV": JSON.stringify(envOptions.nodeEnv),
				"process.env.SPORT": JSON.stringify(sport),
				"process.env.GROQ_API_KEY": JSON.stringify(
					process.env.GROQ_API_KEY ?? "",
				),
				"process.env.COACH_SIDECAR_URL": JSON.stringify(
					process.env.COACH_SIDECAR_URL ?? "",
				),
			},
			jsx: "react-jsx",
		},
		plugins,
		preserveEntrySignatures: false,
		external(id, parentId) {
			// Node-only native addon — used from the worker in Electron via nodeIntegrationInWorker
			if (id === "better-sqlite3") {
				return true;
			}
			// These are in the dropbox package but never actually get executed
			if ((id === "crypto" || id === "util") && parentId?.includes("dropbox")) {
				return true;
			}
		},
		checks: {
			pluginTimings: false,
		},
		onLog(level, log, defaultHandler) {
			// Turn warnings into errors https://rolldown.rs/reference/Interface.RolldownOptions#log
			if (level === "warn") {
				// workerLog.ts is statically imported by electronApi.ts/writeGameStats.ts/writeGameToSqlite.ts
				// and dynamically imported elsewhere (upstream). The dynamic imports are ineffective
				// (won't create a separate chunk) but this is harmless — suppress the warning.
				if (log.code === "INEFFECTIVE_DYNAMIC_IMPORT") {
					return;
				}
				defaultHandler("error", log);
			} else {
				defaultHandler(level, log);
			}
		},
	};
};
