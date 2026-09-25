// Warnings sparkdown gives for mistakes Luau has no counterpart for: the
// narrative, Sparkle UI and asset syntax around the Luau subset. Luau's
// linter tests have no cases for these; they sit beside the ported ones so
// the suite lists everything sparkdown warns about. Messages are pinned
// verbatim.

import { describe, expect, test } from "vitest";
import { diagnoseWithLints, diagnoseDetailed } from "./diagnosticTestHarness";

const WARNING = 2;

describe("an unknown Sparkle event name", () => {
  test("@clik", () => {
    const found = diagnoseDetailed("screen s\n  button @clik=go\nend\n");
    expect(found.map((d) => [d.severity, d.message])).toContainEqual([
      WARNING,
      "Unrecognized event `@clik` — Sparkle dispatches a fixed set of events, so this handler never fires\n> e.g. `@click`, `@input`, `@change`, `@keydown`",
    ]);
  });
});

describe("an unknown Sparkle prop name", () => {
  test("#colr", () => {
    const found = diagnoseDetailed(
      'layout main with\n  row #colr=red:\n    text "x"\nend\n',
    );
    expect(found.map((d) => [d.severity, d.message])).toEqual([
      [
        WARNING,
        "Unrecognized prop `#colr` — not a known style property, so it has no effect\n> Sparkle props are CSS-style names (`background-color`, `gap`, `padding`) or short aliases; use `#--colr` for a custom CSS variable",
      ],
    ]);
  });
});

describe("an unrecognized rich text tag", () => {
  test("<notatag>", () => {
    const found = diagnoseDetailed(
      'layout main with\n  text "a <notatag>x"\nend\n',
    );
    expect(found.map((d) => [d.severity, d.message])).toEqual([
      [
        WARNING,
        "Unrecognized rich text tag `<notatag>` — not a known inline tag, so it renders literally instead of styling anything\n> Styling tags are `<b>`, `<i>`, `<u>`, `<s>`, `<sub>`, `<sup>`, `<mark=…>`, `<color=…>`, `<size=…>`; wrap text in `<noparse>…</noparse>` to keep angle brackets literal",
      ],
    ]);
  });
});

// A misspelled control word is read as the first asset name, so what is
// reported is a missing asset rather than an unknown command.
describe("a misspelled asset command control", () => {
  test("[[shoe x]]", () => {
    expect(diagnoseWithLints("[[shoe x]]\n")).toEqual([
      "Cannot find image named `shoe`",
      "Cannot find image named `x`",
    ]);
  });

  test("((pley x))", () => {
    expect(diagnoseWithLints("((pley x))\n")).toEqual([
      "Cannot find audio named `pley`",
      "Cannot find audio named `x`",
    ]);
  });
});

describe("an empty choice", () => {
  test("* []", () => {
    const messages = diagnoseWithLints(
      "-> main\nscene main\n  choose\n    * []\n  end\nend\n",
    );
    expect(messages).toContain(
      "Blank choice - if you intended a default fallback choice, use the `* ->` syntax",
    );
  });
});

// `...` in a function without a `...` parameter reads the hidden variable
// the lowering gives varargs, and the warning names that variable. Luau's
// error for the same mistake is in FunctionErrors.test.ts.
describe("varargs outside a vararg function", () => {
  test("the warning names the internal variable", () => {
    expect(diagnoseWithLints("function add(x, y) return ... end\n")).toEqual([
      "Cannot find variable named `__varargs__`",
    ]);
  });
});
