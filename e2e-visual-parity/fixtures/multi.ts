import type { Fixture } from "../helpers/seed";

// Minimal valid 1x1 transparent PNG (so the asset list has a real image file).
const PNG_1x1 = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0,
  0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120,
  156, 99, 248, 207, 192, 240, 31, 0, 5, 5, 2, 0, 73, 150, 76, 206, 0, 0, 0, 0,
  73, 69, 78, 68, 174, 66, 96, 130,
]);

/**
 * A richer project than BASIC: multiple scripts + a couple of assets, so the
 * Scripts list and Assets list render multiple rows of real content. Exercises
 * file-list / asset-row rendering parity without needing new handles.
 */
export const MULTI_FIXTURE: Fixture = {
  projectName: "Parity Multi",
  mainSd: ["# MAIN", "", "INT. ROOM - DAY", "", "A plain room.", ""].join("\n"),
  files: [
    { name: "characters.sd", text: "# CHARACTERS\n\nA list of characters.\n" },
    { name: "scenes.sd", text: "# SCENES\n\nScene index.\n" },
    { name: "logo.png", bytes: PNG_1x1 },
    { name: "theme.mid", text: "" },
  ],
};
