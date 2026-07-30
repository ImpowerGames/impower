// The overlay sets `pointer-events: none` on EVERY element, so anything meant
// to be interactive has to opt back in — and opting in does not carry an
// element's children with it, because the universal rule sets the property
// explicitly on each of them rather than letting it inherit.
//
// That has now caused three separate defects, each of which presented as
// something other than a pointer problem:
//
//   - the table's horizontal scrollbar rendered, and the content genuinely
//     overflowed, but the bar could not be grabbed or wheeled ("overflow is
//     broken")
//   - a checkbox's wrapping label did not toggle when its text was clicked
//     ("the label is dead")
//   - every button was clickable only on its padding, because the label span
//     covering most of it was not a hit target ("the modal doesn't open")
//
// The last one is the giveaway: the control is present, styled correctly, and
// simply does not respond. Nothing errors and nothing looks wrong, so it
// survives until someone clicks it.
//
// These assertions are against the STATIC normalize sheet rather than emitted
// CSS, because that is where the universal rule lives and where the exemptions
// have to live with it.

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

/** The declaration block a selector belongs to. */
function ruleFor(selector: string): string {
  const i = CSS.indexOf(selector);
  if (i < 0) return "";
  const open = CSS.indexOf("{", i);
  const close = CSS.indexOf("}", open);
  return open < 0 || close < 0 ? "" : CSS.slice(open, close);
}

describe("overlay pointer-events", () => {
  test("the universal rule still disables pointer events", () => {
    // If this ever stops being true the exemptions below are pointless, and
    // this file should be deleted rather than left asserting nothing.
    expect(ruleFor("spark-web-player * {")).toContain("pointer-events: none");
  });

  // A control's own content sits ON TOP of it. If the content is not a hit
  // target the click lands on nothing at all — it does NOT fall through to the
  // control underneath, which is the assumption that made this easy to miss.
  test.each(["button", "a", "label", "summary", "select", "option"])(
    "`%s *` is a hit target",
    (tag) => {
      const rule = ruleFor(`spark-web-player ${tag} *`);
      expect(
        rule,
        `\`${tag}\` opts into pointer events, but its CONTENT does not — so a ` +
          `click on its text lands on nothing.`,
      ).toContain("pointer-events: auto");
    },
  );
});
