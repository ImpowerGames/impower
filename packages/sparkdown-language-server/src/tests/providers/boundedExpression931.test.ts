import { describe, expect, test } from "vitest";
import { labelsAt } from "./completionHarness";
import { formatSource } from "../formatter/formatSource";
import { parseSource } from "@impower/sparkdown/src/tests/compiler/grammarSnapshot";

describe("bounded expression consumers", () => {
  test("a marked member path offers the same static fields as an ordinary expression", () => {
    const declarations = "store data = { score = 5, title = \"name\" }\n";
    const marked = declarations + "& do local n = data.@1 end\n";
    const ordinary = declarations + "function f()\n  local n = data.@1\nend\n";
    expect(labelsAt(marked, { trigger: "." })).toEqual(labelsAt(ordinary, { trigger: "." }));
    expect(labelsAt(marked, { trigger: "." }).sort()).toEqual(["score", "title"]);
    const tree = parseSource(marked.replace("@1", ""));
    const cursor = tree.cursor();
    const names: string[] = [];
    do { names.push(cursor.name); } while (cursor.next());
    expect(names).toContain("LuauSparkdownExplicitAccessPath");
  });
  test("a marked block retains nested literal aliases for member completion", () => {
    const body = "local data = { inner = { score = 5 } }; local alias = data.inner; local n = alias.@1";
    const marked = `& do ${body} end\n`;
    const ordinary = `function f()\n  ${body}\nend\n`;
    expect(labelsAt(marked, { trigger: "." })).toEqual(["score"]);
    expect(labelsAt(marked, { trigger: "." })).toEqual(labelsAt(ordinary, { trigger: "." }));
  });
  test("a bounded local stays visible inside its own block", () => {
    expect(labelsAt("& do local visible = 5; local n = visi@1 end\n")).toContain("visible");
  });
  test("a bounded local does not escape its block", () => {
    expect(labelsAt("& do local hidden = 5 end\n& local n = hid@1\n")).not.toContain("hidden");
  });
  test("a marked divert value offers its scene target", () => {
    expect(labelsAt("& local target = -> pla@1\nscene place\nHello.\nend\n")).toContain("place");
  });
  test.each([
    ["& do local t={ n=5 };local x=t.n end\nreturn to the village\n", "& do local t = { n = 5 }; local x = t.n end\nreturn to the village\n"],
    ["& do local x=if false then 1 else 5 end\nreturn to the village\n", "& do local x = if false then 1 else 5 end\nreturn to the village\n"],
    ["& do local x=math.abs( -5 ) end\nreturn to the village\n", "& do local x = math.abs(-5) end\nreturn to the village\n"],
  ])("formats a bounded expression and preserves following prose: %s", (source, expected) => {
    expect(formatSource(source)).toBe(expected);
    expect(formatSource(expected)).toBe(expected);
  });
});
