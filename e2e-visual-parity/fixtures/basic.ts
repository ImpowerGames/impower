import type { Fixture } from "../helpers/seed";

/**
 * Minimal deterministic project for the smoke / blank-load checkpoint: a named
 * project with a tiny screenplay. No assets, no diagnostics — just enough to
 * render identical editor chrome in both stacks.
 */
export const BASIC_FIXTURE: Fixture = {
  projectName: "Parity Fixture",
  mainSd: [
    "# PARITY",
    "",
    "INT. ROOM - DAY",
    "",
    "A plain room.",
    "",
    "ALICE",
    "Hello, parity.",
    "",
  ].join("\n"),
};
