import Cache from "./Cache.ts";
import * as getCopies from "./getCopies/index.ts";
import * as getCopy from "./getCopy/index.ts";

const idb = {
	cache: new Cache(),
	getCopies,
	getCopy,
};

export { Cache, idb };
export { default as reset } from "./reset.ts";
