import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { grammar, lintRule } from "../utils/lint-fixture.ts";
import { exemption } from "./luau-foreign-closer.ts";

const findings = (source: string) =>
  lintRule(source, "luau-foreign-closer").filter((m) => !m.message.includes("eslint-disable")).map((m) => `${m.line}: ${m.message.split(", a closer")[0]!.replace(/ \(.*\), so its `end:` must end with nothing before/, " before")}`);

const CATCH_ALL = `LuauUnreadToken:
  patterns:
    - { include: "#LuauUnreadName" }
LuauUnreadName:
  match: "[a-z]+"
LuauBlockBody:
  patterns:
    - { include: "#LuauUnreadToken" }`;

const VARIABLES = `BEAT: (?:^scene[ ])
WS: (?:[ \\t])
LUAU_CLOSER: (?:(?:end|else|elseif|until)(?![a-z]))
LUAU_NOT_PARENTHESIS_CLOSER: (?:{{LUAU_CLOSER}}|[\\]}])`;

test("a bracket ends before every closer it did not open, keyword or bracket", () => {
  const source = grammar({
    variables: VARIABLES,
    repository: `${CATCH_ALL}
LuauParenthetical:
  begin: "[(]"
  patterns:
    - { include: "#LuauUnreadToken" }
  end: ([)])|(?={{WS}}*{{LUAU_NOT_PARENTHESIS_CLOSER}})
LuauKeywordsOnly:
  begin: "[(]"
  patterns:
    - { include: "#LuauUnreadToken" }
  end: ([)])|(?={{WS}}*{{LUAU_CLOSER}})
LuauNoWhitespace:
  begin: "[(]"
  patterns:
    - { include: "#LuauUnreadToken" }
  end: ([)])|(?={{LUAU_NOT_PARENTHESIS_CLOSER}})
LuauNone:
  begin: "[{]"
  patterns:
    - { include: "#LuauUnreadToken" }
  end: ([}])`,
  });
  assert.deepEqual(findings(source), [
    "25: LuauKeywordsOnly is closer-bounded before `]`",
    "30: LuauNoWhitespace is closer-bounded before `end`",
    "35: LuauNone is closer-bounded before `end`",
  ]);
});

test("a block ends before the keyword closers it did not open, and not at a bracket closer", () => {
  const source = grammar({
    variables: VARIABLES,
    repository: `${CATCH_ALL}
LuauDoBlock:
  begin: do
  patterns:
    - { include: "#LuauBlockBody" }
    - { include: "#LuauUnreadToken" }
  end: ({{WS}}*)(end)(?![a-z])|(?={{WS}}*until(?![a-z]))
LuauRepeatLoop:
  begin: repeat
  patterns:
    - { include: "#LuauBlockBody" }
    - { include: "#LuauUnreadToken" }
  end: ({{WS}}*)(until)(?![a-z])
LuauWhileLoop:
  begin: while
  patterns:
    - { include: "#LuauBlockBody" }
  end: (?<=end)|(?={{WS}}*{{LUAU_CLOSER}})`,
  });
  assert.deepEqual(findings(source), ["27: LuauRepeatLoop is closer-bounded before `end`"]);
});

test("the outermost bodies and the rules luau-unread-token exempts are exempt, and so is an applyEndPatternLast rule", () => {
  const source = grammar({
    variables: VARIABLES,
    repository: `${CATCH_ALL}
LuauFunctionBody:
  begin: (?<=[)])
  patterns:
    - { include: "#LuauBlockBody" }
  end: (?=end(?![a-z]))
LuauSparkdownDoBlock:
  begin: do
  end: (end)(?![a-z])
LuauInterpolation:
  begin: "[{]"
  end: "[}]"
  applyEndPatternLast: true
Parenthetical:
  begin: "[(]"
  end: "[)]"`,
  });
  assert.deepEqual(findings(source), []);
  assert.match(exemption("LuauFunctionDefinition")!, /outermost body/);
  assert.match(exemption("LuauSparkdownExplicitDoBlock")!, /story scope/);
  assert.equal(exemption("LuauParenthetical"), undefined);
  assert.equal(exemption("LuauWhileLoop"), undefined);
});

test("the grammar ends every closer-bounded Luau rule before a closer it did not open", () => {
  const source = readFileSync(
    new URL("../../../../definitions/yaml/sparkdown.language-grammar.yaml", import.meta.url),
    "utf8",
  );
  assert.deepEqual(findings(source), []);
});

test("a bracket of the grammar that loses its shared lookahead fails", () => {
  const source = readFileSync(
    new URL("../../../../definitions/yaml/sparkdown.language-grammar.yaml", import.meta.url),
    "utf8",
  );
  const changed = source.replace(
    /^( {2}LuauParenthetical:\n(?: {4}.*\n)*? {4}end: .*)\|\(\?=\{\{WS\}\}\*\{\{LUAU_NOT_PARENTHESIS_CLOSER\}\}\)$/m,
    "$1",
  );
  assert.notEqual(changed, source, "fixture rule not found");
  assert.deepEqual(
    findings(changed).map((f) => f.replace(/^\d+: /, "")),
    ["LuauParenthetical is closer-bounded before `end`"],
  );
});
