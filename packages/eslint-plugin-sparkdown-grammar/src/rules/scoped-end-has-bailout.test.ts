import assert from "node:assert/strict";
import { test } from "node:test";
import { grammar, lintRule } from "../utils/lint-fixture.ts";

const lines = (source: string) =>
  lintRule(source, "scoped-end-has-bailout").map((m) => m.line);

test("an end: with a line end or BEAT passes; a bare closer fails", () => {
  const source = grammar({
    variables: `BEAT: (?:^scene[ ])
EOL: (?:$|[ ]*$)
STOP: (?:{{EOL}}|[;])`,
    repository: `LineEnd:
  begin: a
  end: $|([)])
Beat:
  begin: a
  end: (?={{BEAT}})|([)])
ThroughVariable:
  begin: a
  end: ({{STOP}})
CharClassDollar:
  begin: a
  end: ([$])
Closer:
  begin: a
  end: ([)])
MatchOnly:
  match: a`,
  });
  assert.deepEqual(lines(source), [18, 21]);
});

test("inline begin/end rules are checked too", () => {
  const source = grammar({
    repository: `Outer:
  patterns:
    - begin: a
      end: b`,
  });
  const messages = lintRule(source, "scoped-end-has-bailout");
  assert.equal(messages.length, 1);
  assert.match(messages[0]!.message, /^`end:` of Outer \(inline rule\)/);
});

test("a line end or BEAT inside a negative lookaround is no bail-out", () => {
  const source = grammar({
    variables: "BEAT: (?:^scene[ ])",
    repository: `NotAtEnd:
  begin: a
  end: (?!$)[)]
NotBeat:
  begin: a
  end: (?<!{{BEAT}})[)]
StillBeat:
  begin: a
  end: (?={{BEAT}})|(?!$|[ ])
IndentationBlock:
  begin: a
  end: (?=^(?!$|//))`,
  });
  assert.deepEqual(lines(source), [7, 10]);
});

test("a line end reached only through the closer is no bail-out", () => {
  const source = grammar({
    repository: `NeedsCloser:
  begin: "[(]"
  end: "[)]$"
OptionalCloser:
  begin: "[(]"
  end: "[)]?$"`,
  });
  assert.deepEqual(lines(source), [5]);
});

test("a pattern that does not compile falls back to the textual check", () => {
  const source = grammar({
    repository: `TextualEnd:
  begin: a
  end: ({{MISSING}})$
TextualCloser:
  begin: a
  end: ({{MISSING}})`,
  });
  assert.deepEqual(lines(source), [8]);
});
