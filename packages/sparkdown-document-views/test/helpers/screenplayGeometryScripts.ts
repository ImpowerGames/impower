import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ScreenplayConfig } from "../../../sparkdown-screenplay/src/types/ScreenplayConfig";

export const GEOMETRY_CONFIG: ScreenplayConfig = {
  screenplay_print_title_page: false,
  screenplay_print_page_numbers: false,
  screenplay_print_scene_numbers: "both",
  screenplay_print_scene_identifiers: true,
  screenplay_print_branch_identifiers: true,
  screenplay_print_function_identifiers: true,
};

export const GEOMETRY_SCRIPTS = [
  readFileSync(resolve(__dirname, "../fixtures/demo-screenplay/chapter_1.sd"), "utf8").replace(/\r\n/g, "\n"),
  [
    "scene long_dual",
    "  THEO [<]:",
    "    I take it back, every single word of it, and I mean that sincerely this time.",
    "  ZADIE [>]:",
    "    Best. Night. Ever. Nobody will ever believe a word of what happened here tonight.",
    "  (quietly, to nobody in particular)",
    "  MARCUS:",
    "    Afterwards.",
    "end",
    "",
  ].join("\n"),
  ["scene with_function", "  function greet()", "    GUIDE:", "      Hello there.", "  end", "  Afterwards.", "end", ""].join("\n"),
  ["scene", "  Before.", "end", "scene", "  After.", "end", ""].join("\n"),
  [
    "scene shared",
    "  Before.",
    "  GUIDE: Hi. local z = 3",
    "  queue | One. | Two. end function f() end",
    "  : They go. x = 2",
    "  After.",
    "end",
    "",
  ].join("\n"),
];
