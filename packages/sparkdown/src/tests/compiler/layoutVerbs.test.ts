import { describe, expect, test } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import YAML from "yaml";
import {
  LAYOUT_VERBS,
  LayoutVerb,
  isLayoutVerb,
} from "../../../language/sparkdown.layout-verbs";

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
const STALE = `Run \`npm run language\` from definitions/ to regenerate it.`;

describe("the layout verbs have one definition, the grammar's LAYOUT_CONTROL_KEYWORDS", () => {
  test("the generated verbs module lists the YAML variable's verbs in order", () => {
    expect([...LAYOUT_VERBS], STALE).toEqual(
      SOURCE.variables.LAYOUT_CONTROL_KEYWORDS,
    );
  });

  test("both generated grammar copies carry the same verbs", () => {
    expect(GENERATED.variables.LAYOUT_CONTROL_KEYWORDS, STALE).toEqual([
      ...LAYOUT_VERBS,
    ]);
    expect(VSCODE.variables.LAYOUT_CONTROL_KEYWORDS, STALE).toEqual([
      ...LAYOUT_VERBS,
    ]);
  });

  test("the player and VS Code copies of the verbs module are identical", () => {
    expect(
      read(join("vscode-sparkdown", "language", "sparkdown.layout-verbs.ts")),
      STALE,
    ).toBe(read(join("packages", "sparkdown", "language", "sparkdown.layout-verbs.ts")));
  });

  test("each verb is a named member and is recognised; nothing else is", () => {
    expect(Object.entries(LayoutVerb)).toEqual(
      LAYOUT_VERBS.map((verb) => [verb, verb]),
    );
    for (const verb of LAYOUT_VERBS) {
      expect(isLayoutVerb(verb), verb).toBe(true);
    }
    for (const other of ["show", "play", "load", "Open", "open "]) {
      expect(isLayoutVerb(other), other).toBe(false);
    }
  });
});
