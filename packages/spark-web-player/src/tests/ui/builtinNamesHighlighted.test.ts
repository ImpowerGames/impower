// The grammar carries its OWN list of builtin element names, used to highlight
// them as builtins in the editor. Nothing links it to the engine's actual tag
// tables, so adding an element (`figure`, `picture`, `caption`) or renaming one
// (`disclosure` -> `foldout`) silently leaves the editor highlighting the old
// set — the element works, it just doesn't look like a builtin while you type.
//
// This pins the two together.

import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { existsSync } from "node:fs";

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

const GRAMMAR = readFileSync(
  findUp(join("packages", "sparkdown", "language", "sparkdown.language-grammar.json")),
  "utf8",
);
const UI_MODULE = readFileSync(
  findUp(
    join(
      "packages", "spark-engine", "src", "game", "modules", "ui", "classes",
      "UIModule.ts",
    ),
  ),
  "utf8",
);

function tableKeys(pattern: RegExp): string[] {
  const m = pattern.exec(UI_MODULE);
  if (!m) return [];
  return [...m[1]!.matchAll(/^\s*([a-z_]+):/gm)].map((x) => x[1]!);
}

/** The alternation the grammar uses to recognise a builtin element name.
 *
 *  The class must include DIGITS: `h1`-`h6` are builtin names. Without them the
 *  alternation stops matching at the first digit and this finds nothing at all,
 *  so every test here dies at module load with "alternation not found" rather
 *  than with anything about the name that was actually added. */
function grammarBuiltins(): string[] {
  const m = /\\\\b\(([a-z0-9_|]+)\)\(\?!/.exec(GRAMMAR);
  if (!m) throw new Error("builtin-name alternation not found in grammar");
  return m[1]!.split("|");
}

describe("builtin element names are highlighted", () => {
  const declared = new Set(grammarBuiltins());

  test.each([
    ...tableKeys(/const ELEMENT_TAGS: Record<string, string> =[^{]*\{([\s\S]*?)\n\};/),
    ...tableKeys(/const INPUT_WIDGETS[^{]*\{([\s\S]*?)\n\};/),
  ])("`%s` is in the grammar's builtin list", (tag) => {
    expect(
      declared.has(tag),
      `\`${tag}\` is a builtin element but the grammar will not highlight it`,
    ).toBe(true);
  });

  test("renamed builtins are not left behind", () => {
    for (const gone of ["disclosure", "disclosure_label", "accordion"]) {
      expect(
        declared.has(gone),
        `\`${gone}\` no longer exists but is still highlighted as a builtin`,
      ).toBe(false);
    }
  });

  // Regex alternation is ordered: a shorter name listed first wins, so
  // `table` before `table_header` would leave the longer name unmatched.
  test("longer names precede the shorter names they prefix", () => {
    const list = grammarBuiltins();
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const earlier = list[i]!;
        const later = list[j]!;
        expect(
          later.startsWith(earlier),
          `"${earlier}" precedes "${later}", so "${later}" can never match`,
        ).toBe(false);
      }
    }
  });
});
