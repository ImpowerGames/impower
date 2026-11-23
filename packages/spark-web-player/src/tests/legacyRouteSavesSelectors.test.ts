import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(__dirname, "..");

const STYLESHEETS = ["route/route-list.css", "saves/saves.css"];

const SOURCES = [
  ...["route", "saves"].flatMap((dir) =>
    readdirSync(join(SRC, dir))
      .filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
      .map((name) => join(dir, name)),
  ),
  "SparkWebPlayer.tsx",
  "GamePlayerController.ts",
  "components/PlayerBar/PlayerBar.tsx",
];

const emittedTokens = () => {
  const tokens = new Set<string>();
  for (const file of SOURCES) {
    const source = readFileSync(join(SRC, file), "utf8");
    for (const [, quoted, templated] of source.matchAll(/"([^"]*)"|`([^`]*)`/g)) {
      for (const token of (quoted ?? templated ?? "").split(/\s+/)) {
        if (token) tokens.add(token);
      }
    }
  }
  return tokens;
};

const namedClasses = (css: string) =>
  new Set(
    [...css.replace(/\{[^{}]*\}/g, "{}").matchAll(/\.([a-z][\w-]*)/g)].map(
      (match) => match[1]!,
    ),
  );

describe("the player's route list and Saves stylesheets", () => {
  it.each(STYLESHEETS)("name only classes the player's views still emit: %s", (sheet) => {
    const emitted = emittedTokens();
    const css = readFileSync(join(SRC, sheet), "utf8");
    const unused = [...namedClasses(css)].filter((name) => !emitted.has(name));
    expect(unused).toEqual([]);
  });
});
