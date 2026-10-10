import assert from "node:assert/strict";
import { test } from "node:test";
import { grammar, lintRule } from "../utils/lint-fixture.ts";

const NL = "NL: (?:\\r\\n|\\r|\\n)";

const findings = (repository: string, variables?: string) =>
  lintRule(grammar({ repository, variables }), "no-newline-in-lookaround").map(
    (m) => m.message.split(" reads across")[0],
  );

test("a lookahead that reads past the line break fails", () => {
  assert.deepEqual(findings(`Rule:
  begin: (x)
  end: (?=\\n\\S)`), ["Rule.end: `\\n` with more of its lookahead after it"]);
});

test("a variable's line break is checked where a rule's lookahead reads past it", () => {
  assert.deepEqual(
    findings(`Rule:
  begin: (x)
  end: "{{BEFORE_NEXT_LINE}}"`, `${NL}
BEFORE_NEXT_LINE: (?={{NL}}(?=\\S)(?!then))`),
    ["Rule.end: `\\r\\n` with more of its lookahead after it (from variable BEFORE_NEXT_LINE)"],
  );
});

test("a line break that ends its lookahead passes", () => {
  assert.deepEqual(findings(`Rule:
  begin: (x)
  end: (?=$|{{NL}})
Other:
  match: (y)(?=\\r\\n|\\r|\\n)`, NL), []);
});

test("a rule that ends at the start of the next line passes", () => {
  assert.deepEqual(findings(`Rule:
  begin: (x)
  end: ^(?=\\S)(?!then)`), []);
});

test("a line break inside a lookbehind fails", () => {
  assert.deepEqual(findings(`Rule:
  match: (?<={{NL}}if)(x)`, NL), ["Rule.match: `\\r\\n` inside a lookbehind (from variable NL)"]);
});

test("a class that names a line break fails where its lookahead reads on", () => {
  assert.deepEqual(findings(`Rule:
  match: (x)(?=[\\r\\n]y)`), ["Rule.match: `[\\r\\n]` with more of its lookahead after it"]);
});

test("\\s inside a lookaround fails", () => {
  assert.deepEqual(findings(`Rule:
  match: (x)(?=\\s*y)`), ["Rule.match: `\\s` (matches `\\n`) inside a lookaround"]);
});

test("a variable that reads past the line on purpose says why and passes", () => {
  const trivia = `# reads-past-line: skips blank lines to the next token.
TRIVIA: (?:[\\r\\n]|{{WS}})*
WS: (?:[^\\S\\n\\r])`;
  assert.deepEqual(findings(`Rule:
  match: (x)(?={{TRIVIA}}y)`, trivia), []);
});

test("a line break repeated within its lookahead fails", () => {
  assert.deepEqual(findings(`Rule:
  begin: (x)
  end: (?=\\n{2})
Other:
  begin: (y)
  end: (?=(?:\\n)+)`), [
    "Rule.end: `\\n` repeated within its lookahead",
    "Other.end: `\\n` repeated within its lookahead",
  ]);
});

test("a class holding \\s fails where its lookahead reads on", () => {
  assert.deepEqual(findings(`Rule:
  begin: (x)
  end: (?=[\\s]+x)`), ["Rule.end: `[\\s]` with more of its lookahead after it"]);
});

test("an exempt variable's line break does not hide a later one in the same lookahead", () => {
  const trivia = `# reads-past-line: skips blank lines to the next token.
TRIVIA: (?:[\\r\\n]|{{WS}})*
WS: (?:[^\\S\\n\\r])`;
  assert.deepEqual(findings(`Rule:
  match: (x)(?={{TRIVIA}}q\\nZ)`, trivia), ["Rule.match: `\\n` with more of its lookahead after it"]);
});
