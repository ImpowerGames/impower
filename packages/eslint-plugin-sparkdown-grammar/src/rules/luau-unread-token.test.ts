import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { grammar, lintRule } from "../utils/lint-fixture.ts";
import { exemption } from "./luau-unread-token.ts";

const findings = (source: string) =>
  lintRule(source, "luau-unread-token").map((m) => `${m.line}: ${m.message.split(", so")[0]!.split(" (")[0]}`);

const CATCH_ALL = `LuauUnreadToken:
  patterns:
    - { include: "#LuauUnreadName" }
LuauUnreadName:
  match: "[a-z]+"
LuauBlockBody:
  patterns:
    - { include: "#LuauUnreadToken" }`;

test("a rule whose end consumes a closer must end its patterns with the catch-all", () => {
  const source = grammar({
    variables: "BEAT: (?:^scene[ ])",
    repository: `${CATCH_ALL}
LuauCall:
  begin: "[(]"
  patterns:
    - { include: "#LuauUnreadName" }
  end: (?={{BEAT}})|([)])
LuauDo:
  begin: do
  patterns:
    - { include: "#LuauUnreadToken" }
    - { include: "#LuauUnreadName" }
  end: (end)\\b
LuauTiled:
  begin: "[{]"
  patterns:
    - { include: "#LuauUnreadName" }
    - { include: "#LuauUnreadToken" }
  end: "[}]"
LuauTypeArguments:
  begin: "[<]"
  end: "[>]"`,
  });
  assert.deepEqual(findings(source), [
    "17: LuauCall is closer-bounded",
    "23: LuauDo is closer-bounded",
    "32: LuauTypeArguments is closer-bounded",
  ]);
});

test("a rule that holds a block body is closer-bounded whatever its end", () => {
  const source = grammar({
    variables: "BEAT: (?:^scene[ ])",
    repository: `${CATCH_ALL}
LuauBody:
  begin: (?<=[)])
  patterns:
    - { include: "#LuauBlockBody" }
  end: (?={{BEAT}}|[ ]*end\\b)
LuauTiledBody:
  begin: (?<=then)
  patterns:
    - { include: "#LuauBlockBody" }
    - { include: "#LuauUnreadToken" }
  end: (?=[ ]*end\\b)`,
  });
  assert.deepEqual(findings(source), ["17: LuauBody is closer-bounded"]);
});

test("an end that consumes ordinary tokens as well as a closer is not closer-bounded", () => {
  const source = grammar({
    repository: `${CATCH_ALL}
LuauQualifier:
  begin: "[.]"
  end: ([a-z]+)`,
  });
  assert.deepEqual(findings(source), []);
});

test("a zero-width end must not include the catch-all, directly or through a Switch", () => {
  const source = grammar({
    repository: `${CATCH_ALL}
LuauValues:
  patterns:
    - { include: "#LuauUnreadToken" }
LuauOperation:
  begin: "[+]"
  patterns:
    - { include: "#LuauUnreadToken" }
  end: (?=[,;)]|$)
LuauThroughSwitch:
  begin: "[-]"
  patterns:
    - { include: "#LuauValues" }
  end: (?=[,;)]|$)
LuauPlain:
  begin: "[*]"
  patterns:
    - { include: "#LuauUnreadName" }
  end: (?=[,;)]|$)`,
  });
  assert.deepEqual(findings(source), [
    "18: LuauOperation's `end:` consumes nothing",
    "23: LuauThroughSwitch's `end:` consumes nothing",
  ]);
});

test("an applyEndPatternLast rule must not include the catch-all", () => {
  const source = grammar({
    repository: `${CATCH_ALL}
LuauInterpolation:
  begin: "[{]"
  patterns:
    - { include: "#LuauUnreadToken" }
  end: "[}]"
  applyEndPatternLast: true
LuauCall:
  begin: "[a-z]+(?=[(])"
  patterns:
    - { include: "#LuauUnreadName" }
  end: (?=.)
  applyEndPatternLast: true`,
  });
  assert.deepEqual(findings(source), ["16: LuauInterpolation has `applyEndPatternLast`"]);
});

test("only Luau rules are checked, and the exempt ones say why", () => {
  const source = grammar({
    repository: `${CATCH_ALL}
Parenthetical:
  begin: "[(]"
  end: "[)]"
LuauSparkdownDoBlock:
  begin: do
  end: (end)\\b
LuauStyle:
  begin: style
  end: (end)\\b`,
  });
  assert.deepEqual(findings(source), []);
  assert.match(exemption("LuauSparkdownExplicitDoBlock")!, /story scope/);
  assert.match(exemption("LuauLayout")!, /layout block/);
  assert.equal(exemption("LuauSparkleHandlerClosure"), undefined);
  assert.equal(exemption("LuauFunctionCallParameters"), undefined);
});

test("the grammar tiles every closer-bounded Luau rule", () => {
  const source = readFileSync(
    new URL("../../../../definitions/yaml/sparkdown.language-grammar.yaml", import.meta.url),
    "utf8",
  );
  assert.deepEqual(findings(source).filter((f) => !f.includes("eslint-disable")), []);
});
