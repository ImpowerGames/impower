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

  test("the player and VS Code copies carry the same rules", () => {
    expect(names(VSCODE)).toEqual(names(GENERATED));
  });

  test("every YAML rule's pattern parses as a string", () => {
    const nonString = Object.entries(
      SOURCE.repository as Record<string, Record<string, unknown>>,
    ).flatMap(([name, rule]) =>
      ["match", "begin", "end", "while"]
        .filter((key) => key in rule && typeof rule[key] !== "string")
        .map((key) => `${name}.${key}`),
    );
    expect(
      nonString,
      `an unquoted \`{{VARIABLE}}\` value parses as a YAML flow mapping; quote it.`,
    ).toEqual([]);
  });

  test("LuauTargetTypeCastOperator matches the `::` operator in both copies", () => {
    expect(GENERATED.repository.LuauTargetTypeCastOperator.match).toBe(
      "(?:[:][:])",
    );
    expect(VSCODE.repository.LuauTargetTypeCastOperator.match).toBe(
      "(?:[:][:])",
    );
  });
});
