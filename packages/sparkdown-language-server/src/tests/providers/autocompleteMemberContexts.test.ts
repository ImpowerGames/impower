import { describe, expect, test } from "vitest";
import { readLuauUnits } from "@impower/sparkdown/src/compiler/typecheck/readLuauAst";
import { parseSource } from "@impower/sparkdown/src/tests/compiler/grammarSnapshot";
import { complete, labelsAt } from "./completionHarness";

const contexts: [string, string, string[]][] = [
  ["ordinary function control", "function main()\n  local t = { x = 1 }\n  return t.@1\nend\n", ["x"]],
  ["local table in an explicit define function", "define Point with\n  function inspect()\n    local t = { x = 1 }\n    return t.@1\n  end\nend\n", ["x"]],
  ["global table in an explicit define function", "store t = { x = 1 }\ndefine Point with\n  function inspect()\n    return t.@1\n  end\nend\n", ["x"]],
  ["local table in a shorthand define method", "define Point with\n  inspect()\n    local t = { x = 1 }\n    return t.@1\n  end\nend\n", ["x"]],
  ["global table in a shorthand define method", "store t = { x = 1 }\ndefine Point with\n  inspect()\n    return t.@1\n  end\nend\n", ["x"]],
  ["nested method closure captures a local table", "define Point with\n  function inspect()\n    local t = { x = 1 }\n    local f = function()\n      return t.@1\n    end\n  end\nend\n", ["x"]],
  ["nested method closure parameter shadows a local table", "define Point with\n  function inspect()\n    local t = { x = 1 }\n    local f = function(t)\n      return t.@1\n    end\n  end\nend\n", []],
  ["method parameter shadows a global table", "store t = { x = 1 }\ndefine Point with\n  function inspect(t)\n    return t.@1\n  end\nend\n", []],
  ["local method value shadows a global table", "store t = { x = 1 }\ndefine Point with\n  function inspect()\n    local t = 1\n    return t.@1\n  end\nend\n", []],
  ["a completed method block restores its outer local", "define Point with\n  function inspect()\n    local t = { outer = 1 }\n    do\n      local t = { inner = 1 }\n    end\n    return t.@1\n  end\nend\n", ["outer"]],
  ["sibling method locals do not leak", "store t = { global = 1 }\ndefine Point with\n  function first()\n    local t = { sibling = 1 }\n  end\n  function second()\n    return t.@1\n  end\nend\n", ["global"]],
  ["method alias assignments retain their receiver", "define Point with\n  function inspect()\n    local t = { initial = 1 }\n    local alias = t\n    alias.extra = 2\n    return t.@1\n  end\nend\n", ["extra", "initial"]],
  ["define property receiver", "store t = { x = 1 }\ndefine Point with\n  value = t.@1\nend\n", ["x"]],
  ["nested define property receiver", "store t = { nested = { x = 1 } }\ndefine Point with\n  value = t.nested.@1\nend\n", ["x"]],
  ["define property function has its own local inventory", "define Point with\n  callback = function()\n    local t = { x = 1 }\n    return t.@1\n  end\nend\n", ["x"]],
  ["define property function parameter shadows a global", "store t = { x = 1 }\ndefine Point with\n  callback = function(t)\n    return t.@1\n  end\nend\n", []],
  ["bracket-key define property receiver", 'store t = { x = 1 }\ndefine Point with\n  ["value-key"] = t.@1\nend\n', ["x"]],
  ["bracket-key property closure retains its local inventory", 'define Point with\n  ["callback-key"] = function()\n    local t = { x = 1 }\n    return t.@1\n  end\nend\n', ["x"]],
  ["bracket-key property closure parameter shadows a global", 'store t = { x = 1 }\ndefine Point with\n  ["callback-key"] = function(t)\n    return t.@1\n  end\nend\n', []],
  ["a plain property closure can start after a line-ending equals", "define Point with\n  callback =\n    function()\n      local t = { x = 1 }\n      return t.@1\n    end\nend\n", ["x"]],
  ["a bracket property closure can start after a line-ending equals", 'define Point with\n  ["callback-key"] =\n    function()\n      local t = { x = 1 }\n      return t.@1\n    end\nend\n', ["x"]],
  ["narrative interpolation global", "store t = { x = 1 }\nscene start\n  Score: {t.@1}\nend\n", ["x"]],
  ["narrative interpolation flow local", "scene start\n  local t = { x = 1 }\n  Score: {t.@1}\nend\n", ["x"]],
  ["narrative interpolation parameter shadows a global", "store t = { x = 1 }\nscene start(t)\n  Score: {t.@1}\nend\n", []],
  ["narrative interpolation local shadows a global", "store t = { global = 1 }\nscene start\n  local t = { localField = 1 }\n  Score: {t.@1}\nend\n", ["localField"]],
  ["choice text interpolation", "store t = { x = 1 }\nscene start\n  * Score: {t.@1}\nend\n", ["x"]],
  ["Sparkle inline handler local", "layout hud with\n  button \"Go\" @click={ local t = { x = 1 }; return t.@1 }\nend\n", ["x"]],
  ["Sparkle multiline handler local", "layout hud with\n  button \"Go\" @click={\n    local t = { x = 1 }\n    return t.@1\n  }\nend\n", ["x"]],
  ["Sparkle handler global", "store t = { x = 1 }\nlayout hud with\n  button \"Go\" @click={ return t.@1 }\nend\n", ["x"]],
  ["Sparkle handler nested closure", "layout hud with\n  button \"Go\" @click={\n    local t = { x = 1 }\n    local f = function() return t.@1 end\n  }\nend\n", ["x"]],
  ["Sparkle sibling handlers keep separate locals", "store t = { global = 1 }\nlayout hud with\n  button \"First\" @click={ local t = { sibling = 1 } }\n  button \"Second\" @click={ return t.@1 }\nend\n", ["global"]],
  ["a dotted function declaration prefix is not a member request", "store tbl = { field = 1 }\nfunction tbl.so@1mething() end\n", []],
  ["a property closure's nested declaration target is not a member request", "store tbl = { field = 1 }\ndefine Point with\n  callback = function()\n    function tbl.something@1() end\n  end\nend\n", []],
  ["a nested property function body still offers its receiver members", "store tbl = { field = 1 }\ndefine Point with\n  callback = function()\n    function tbl.something()\n      return tbl.@1\n    end\n  end\nend\n", ["field", "something"]],
  ["a nested handler method body still offers its receiver members", 'store tbl = { field = 1 }\nlayout hud with\n  button "Go" @click={ function tbl:something() return tbl.@1 end }\nend\n', ["field", "something"]],
];

function applyMember(source: string, label: string): string {
  const item = complete(source).items.find((candidate) => candidate.label === label);
  expect(item, `completion for ${label}`).toBeDefined();
  const edit = item?.textEdit;
  if (!edit || !("range" in edit)) throw new Error("Expected a ranged member edit");
  const text = source.replace(/@\d/g, "");
  const offset = (position: { line: number; character: number }) =>
    text.split("\n").slice(0, position.line).reduce((sum, line) => sum + line.length + 1, 0) + position.character;
  return text.slice(0, offset(edit.range.start)) + edit.newText + text.slice(offset(edit.range.end));
}

describe("static members in authored expression contexts (#867)", () => {
  test.each(contexts)("%s", (_name, source, expected) => {
    expect(labelsAt(source).sort()).toEqual(expected);
  });

  test("ordinary prose remains outside a member expression", () => {
    expect(labelsAt("store t = { x = 1 }\nscene start\n  Plain t.@1\nend\n")).not.toContain("x");
  });

  test("a changed define method receiver is refreshed incrementally", () => {
    const source = "define Point with\n  function inspect()\n    local t = { before = 1 }\n    return t.@1\n  end\nend\n";
    const changed = source.replace("before = 1", "after = 1");
    expect(labelsAt(changed, { editedFrom: source.replace("@1", "") })).toEqual(["after"]);
  });

  test("a changed property table is refreshed incrementally", () => {
    const source = "store t = { before = 1 }\ndefine Point with\n  value = t.@1\nend\n";
    const changed = source.replace("before = 1", "after = 1");
    expect(labelsAt(changed, { editedFrom: source.replace("@1", "") })).toEqual(["after"]);
  });

  test("a property closure's later local does not replace an earlier global initializer", () => {
    expect(labelsAt("store t = { global = 1 }\ndefine Point with\n  callback = function()\n    local saved = t\n    local t = { later = 1 }\n    return saved.@1\n  end\nend\n")).toEqual(["global"]);
  });

  test("an interpolation uses the visible outer declaration after an inner block closes", () => {
    expect(labelsAt("scene start\n  local t = { outer = 1 }\n  do\n    local t = { inner = 1 }\n  end\n  Score: {t.@1}\nend\n")).toEqual(["outer"]);
  });

  test("a narrative interpolation does not see another scene's local", () => {
    expect(labelsAt("store t = { global = 1 }\nscene first\n  local t = { otherScene = 1 }\nend\nscene second\n  Score: {t.@1}\nend\n")).toEqual(["global"]);
  });

  test("a member-shaped type annotation is not a value receiver", () => {
    expect(labelsAt("store t = { valueField = 1 }\nfunction main()\n  local n: t.@1\nend\n")).not.toContain("valueField");
  });

  test("implicit method self remains an unknown parameter", () => {
    expect(labelsAt("store self = { global = 1 }\nfunction main()\n  local t = { x = 1 }\n  function t:m()\n    return self.@1\n  end\nend\n")).toEqual([]);
  });

  test.each(["function inspect()", "inspect()"])("a define method's implicit self hides a stored global: %s", (header) => {
    expect(labelsAt(`store self = { global = 1 }\ndefine Point with\n  ${header}\n    return self.@1\n  end\nend\n`)).toEqual([]);
  });

  test.each(["function inspect()", "inspect()"])("a define method's implicit self hides an outer script local: %s", (header) => {
    expect(labelsAt(`local self = { outer = 1 }\ndefine Point with\n  ${header}\n    return self.@1\n  end\nend\n`)).toEqual([]);
  });

  test.each(["function inspect()", "inspect()"])("explicit assignment gives define self a known shape: %s", (header) => {
    expect(labelsAt(`store self = { global = 1 }\ndefine Point with\n  ${header}\n    self = { assigned = 1 }\n    return self.@1\n  end\nend\n`)).toEqual(["assigned"]);
  });

  test.each(["function inspect()", "inspect()"])("an authored local shadows define self: %s", (header) => {
    expect(labelsAt(`store self = { global = 1 }\ndefine Point with\n  ${header}\n    local self = { localField = 1 }\n    return self.@1\n  end\nend\n`)).toEqual(["localField"]);
  });

  test.each(["function inspect()", "inspect()"])("a nested closure captures unknown define self: %s", (header) => {
    expect(labelsAt(`store self = { global = 1 }\ndefine Point with\n  ${header}\n    local nested = function()\n      return self.@1\n    end\n  end\nend\n`)).toEqual([]);
  });

  test.each(["function inspect()", "inspect()"])("a nested parameter shadows explicitly assigned define self: %s", (header) => {
    expect(labelsAt(`define Point with\n  ${header}\n    self = { assigned = 1 }\n    local nested = function(self)\n      return self.@1\n    end\n  end\nend\n`)).toEqual([]);
  });

  test.each(["function inspect()", "inspect()"])("a later local does not replace the earlier implicit self binding: %s", (header) => {
    expect(labelsAt(`store self = { global = 1 }\ndefine Point with\n  ${header}\n    local saved = self\n    local self = { later = 1 }\n    return saved.@1\n  end\nend\n`)).toEqual([]);
  });

  test("a property function keeps a genuine captured global named self", () => {
    expect(labelsAt("store self = { global = 1 }\ndefine Point with\n  callback = function()\n    return self.@1\n  end\nend\n")).toEqual(["global"]);
  });

  test("a sibling define method never supplies another method's self value", () => {
    expect(labelsAt("store self = { global = 1 }\ndefine Point with\n  function first()\n    self = { sibling = 1 }\n  end\n  second()\n    return self.@1\n  end\nend\n")).toEqual([]);
  });

  test("an explicit assignment gives implicit self a known shape", () => {
    expect(labelsAt("function main()\n  local t = {}\n  function t:m()\n    self = { assigned = 1 }\n    return self.@1\n  end\nend\n")).toEqual(["assigned"]);
  });

  test("quoted define member discovery includes literal bracket properties", () => {
    expect(labelsAt('define Point with\n  ["value-key"] = { field = 1 }\n  ["callback-key"] = function()\n    local leaked = 1\n  end\nend\nfunction main()\n  return Point["@1"]\nend\n').sort()).toEqual(["callback-key", "value-key"]);
  });

  test("a literal bracket property retains its nested table shape", () => {
    expect(labelsAt('define Point with\n  ["value-key"] = { field = 1 }\nend\nfunction main()\n  return Point["value-key"].@1\nend\n')).toEqual(["field"]);
  });

  test("a bracket property closure never seeds its local names as define fields", () => {
    expect(labelsAt('define Point with\n  plain = 1\n  ["callback-key"] = function()\n    local leaked = 1\n  end\nend\nfunction main()\n  return Point.@1\nend\n')).toEqual(["plain"]);
  });

  test("an identifier-shaped bracket property function is callable after a colon", () => {
    expect(labelsAt('define Point with\n  ["handler"] = function() end\nend\nfunction main()\n  Point:@1()\nend\n')).toEqual(["handler"]);
  });

  test("quoted define keys decode Unicode and preserve reserved names", () => {
    expect(labelsAt('define Point with\n  ["café"] = 1\n  ["end"] = 2\nend\nfunction main()\n  return Point["@1"]\nend\n').sort()).toEqual(["café", "end"]);
  });

  test("a computed define key has no syntactically fixed member name", () => {
    expect(labelsAt('store key = "computed"\ndefine Point with\n  [key] = { field = 1 }\nend\nfunction main()\n  return Point["@1"]\nend\n')).toEqual([]);
  });

  test.each(["value", '["value-key"]'])("a property table after a line-ending equals retains its shape: %s", (key) => {
    const receiver = key === "value" ? "Point.value" : 'Point["value-key"]';
    expect(labelsAt(`define Point with\n  ${key} =\n    { field = 1 }\nend\nfunction main()\n  return ${receiver}.@1\nend\n`)).toEqual(["field"]);
  });
});

describe("syntax-valid static member edits (#867)", () => {
  const fields = '{ ["end"] = 1, ["true"] = 2, ["and"] = 3, ["local"] = 4, ["function"] = 5, continue = 6, valid = 7 }';

  test.each(["", "e"])("dot excludes reserved keys with suffix %j", (suffix) => {
    const source = `store t = ${fields}\nfunction main()\n  return t.${suffix}@1\nend\n`;
    expect(labelsAt(source).sort()).toEqual(["continue", "valid"]);
    for (const label of ["continue", "valid"]) {
      const applied = applyMember(source, label);
      expect(applied).toContain(`return t.${label}\n`);
      expect(readLuauUnits(parseSource(applied), applied).prelude.errors.map((error) => error.message)).toEqual([]);
    }
  });

  test("colon excludes callable reserved keys", () => {
    const source = 'store t = { ["end"] = function() end, ["and"] = function() end, valid = function() end }\nfunction main()\n  t:@1()\nend\n';
    expect(labelsAt(source)).toEqual(["valid"]);
    const applied = applyMember(source, "valid");
    expect(applied).toContain("t:valid()");
    expect(readLuauUnits(parseSource(applied), applied).prelude.errors.map((error) => error.message)).toEqual([]);
  });

  test("every offered dot edit parses as a valid member access", () => {
    const source = `store t = ${fields}\nfunction main()\n  return t.@1\nend\n`;
    const labels = labelsAt(source);
    expect(labels).toContain("valid");
    for (const label of labels) {
      const applied = applyMember(source, label);
      expect(readLuauUnits(parseSource(applied), applied).prelude.errors.map((error) => error.message), label).toEqual([]);
    }
  });

  test.each(['"', "'"])("quoted index retains reserved keys with quote %j", (quote) => {
    const source = `store t = ${fields}\nfunction main()\n  return t[${quote}@1${quote}]\nend\n`;
    expect(labelsAt(source).sort()).toEqual(["and", "continue", "end", "function", "local", "true", "valid"]);
    const applied = applyMember(source, "end");
    expect(applied).toContain(`return t[${quote}end${quote}]`);
    expect(readLuauUnits(parseSource(applied), applied).prelude.errors.map((error) => error.message)).toEqual([]);
  });
});
