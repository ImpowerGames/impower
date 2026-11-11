import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import YAML from "yaml";

export function findUp(rel: string): string {
  let dir = resolve(process.cwd());
  for (;;) {
    const candidate = join(dir, rel);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`could not find ${rel}`);
    dir = parent;
  }
}

export const GRAMMAR_SOURCE_FILES = [
  join("definitions", "yaml", "sparkdown.language-grammar.yaml"),
  join("definitions", "yaml", "sparkdown-luau.language-grammar.yaml"),
];

export function readGrammarSource() {
  const [story, luau] = GRAMMAR_SOURCE_FILES.map((rel) =>
    YAML.parse(readFileSync(findUp(rel), "utf8")),
  );
  return {
    ...story,
    variables: { ...story.variables, ...luau.variables },
    repository: { ...story.repository, ...luau.repository },
  };
}
