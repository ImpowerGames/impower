import { describe, expect, test } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

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

const CSS = readFileSync(
  findUp(join("packages", "spark-web-player", "src", "spark-web-player.css")),
  "utf8",
);

function blocksDisablingPointerEvents(): string[] {
  const css = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: string[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    if (/pointer-events:\s*none/.test(m[2]!)) out.push(m[1]!.trim());
  }
  return out;
}

describe("overlay pointer-events", () => {
  test("the overlay root is transparent to the pointer", () => {
    expect(blocksDisablingPointerEvents()).toContain(
      "spark-web-player #game-ui",
    );
  });

  test("it is NOT disabled by a universal selector", () => {
    const universal = blocksDisablingPointerEvents().filter((sel) =>
      /(^|,)\s*spark-web-player \*\s*$/.test(sel),
    );
    expect(
      universal,
      "`pointer-events: none` on `*` defeats inheritance: a control can opt " +
        "itself back in but not its own text, so clicks on a button's label " +
        "land on nothing. Set it on the overlay ROOT and let it inherit.",
    ).toEqual([]);
  });
});
