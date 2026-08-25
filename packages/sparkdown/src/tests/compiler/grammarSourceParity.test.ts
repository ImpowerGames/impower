// The grammar JSON is GENERATED from `definitions/yaml/*.yaml`, and its own
// header says so: "Do NOT edit this JSON file directly — your changes will be
// lost on the next build."
//
// They were. The JSON had drifted 383 lines ahead of its source: the entire
// regex-literal grammar (`@/re/flags`), the rich-text tag rules, single-quoted
// string rules and `LuauSparkleEventHandlerName` existed ONLY in the generated
// file. Editing the JSON works — the editor picks it up immediately, every test
// passes — so nothing signals that the change is living on borrowed time. It
// only surfaces when someone runs the documented `npm run language`, which
// silently deletes the work. That happened, and it took `regexHighlighting`
// from 8 passing to 6 failing with no other clue.
//
// It also drifted the two SHIPPED copies apart: the hand-edits only ever landed
// in `packages/sparkdown`, so the VS Code extension had no regex-literal or
// rich-text highlighting at all, and nothing compared them.
//
// This pins both invariants by NAME. It cannot catch a hand-edited regex inside
// a rule that exists in both places (that needs running the generator), but the
// failure that actually happened is a whole rule present in one and absent from
// the other, and that is what this catches.

import { describe, expect, test } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import YAML from "yaml";

function findUp(rel: string): string {
  let dir = resolve(process.cwd());
  for (;;) {
    const candidate = join(dir, rel);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`could not find ${rel}`);
    dir = parent;
  }
}

const read = (rel: string) => readFileSync(findUp(rel), "utf8");

const SOURCE = YAML.parse(
  read(join("definitions", "yaml", "sparkdown.language-grammar.yaml")),
);
const GENERATED = JSON.parse(
  read(join("packages", "sparkdown", "language", "sparkdown.language-grammar.json")),
);
const VSCODE = JSON.parse(
  read(join("vscode-sparkdown", "language", "sparkdown.language-grammar.json")),
);

const names = (g: { repository?: Record<string, unknown> }) =>
  Object.keys(g.repository ?? {}).sort();

describe("the generated grammar matches its YAML source", () => {
  test("every generated rule comes from the YAML", () => {
    const orphans = names(GENERATED).filter((n) => !(n in SOURCE.repository));
    expect(
      orphans,
      `these rules exist only in the generated JSON, so \`npm run language\` ` +
        `will DELETE them. Move them into definitions/yaml/.`,
    ).toEqual([]);
  });

  test("every YAML rule reaches the generated grammar", () => {
    const dropped = Object.keys(SOURCE.repository).filter(
      (n) => !(n in GENERATED.repository),
    );
    expect(
      dropped,
      `these rules are in the YAML but missing from the generated JSON — ` +
        `the checked-in grammar is stale. Run \`npm run language\` from definitions/.`,
    ).toEqual([]);
  });

  // Both copies ship. They are generated from one source in one command, so any
  // difference means one of them was edited by hand or generated at a different
  // time — and the stale one is invisible until someone uses that editor.
  test("the player and VS Code copies carry the same rules", () => {
    expect(names(VSCODE)).toEqual(names(GENERATED));
  });
});
