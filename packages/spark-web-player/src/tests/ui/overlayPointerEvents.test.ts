// The UI overlay is transparent to the pointer so a click on empty layout space
// reaches the game canvas underneath it. That is set ONCE on the overlay root
// and INHERITED — `pointer-events` is an inherited property, so a control that
// sets `pointer-events: auto` brings its whole subtree with it.
//
// It was `* { pointer-events: none }` until this test was rewritten, which sets
// the property EXPLICITLY on every element and therefore defeats inheritance. A
// control could opt itself back in but not its own content, and since a label
// span covers most of a button, the click landed on nothing — it does NOT fall
// through to the control underneath, which is the assumption that made this
// hard to see.
//
// Four defects came from that, none of which presented as a pointer problem:
//
//   - the table's scrollbar rendered and the content genuinely overflowed, but
//     the bar could not be grabbed ("overflow is broken")
//   - a checkbox's wrapping label did not toggle from its text ("dead label")
//   - every button ignored clicks on its label ("the modal doesn't open")
//   - the abbr tooltip never appeared, because `:hover` cannot fire on an
//     element that is not a hit target ("the tooltip is missing")
//
// Each was patched individually before the shared cause was clear. The rule
// this file exists to protect: set it in ONE place and let it inherit.

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

/** Every selector that sets `pointer-events: none`.
 *
 *  Comments are stripped FIRST. This file is heavily commented, and a comment
 *  contains no braces — so a naive rule regex swallows the whole comment above
 *  a rule into its "selector" and every comparison silently fails. */
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
    // This is what lets a click on empty layout space reach the game canvas.
    expect(blocksDisablingPointerEvents()).toContain(
      "spark-web-player #game-ui",
    );
  });

  // The regression that cost four bugs. A universal selector sets the property
  // on every element individually, so `auto` on a control stops at the control.
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
