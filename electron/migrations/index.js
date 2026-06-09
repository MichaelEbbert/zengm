// Add migrations here in order. Each runs exactly once and never rolls back.
import * as m001 from "./001_box_scores.js";

export const migrations = [m001];
