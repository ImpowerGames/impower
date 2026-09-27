// The name and scope model the Luau lints share (`compiler/lint/luauNames.ts`):
// which declaration each occurrence of a name refers to, and the program-wide
// index of globals with every use from any script.

import { describe, expect, test } from "vitest";
import { collectLuauLints } from "../../compiler/lint/collectLuauLints";
import {
  indexProgramNames,
  type ScriptNames,
} from "../../compiler/lint/luauNames";
import { parseSource } from "./grammarSnapshot";

function namesOf(source: string): ScriptNames {
  return collectLuauLints(parseSource(source), (from, to) =>
    source.slice(from, to),
  ).names;
}

function lineOf(source: string, pos: number) {
  return source.slice(0, pos).split("\n").length;
}

/** Each occurrence of `name` in the script's functions, as
 *  `L<line> <kind> -> <kind>@L<line>, ...`, or `-> global`. */
function resolutions(source: string, name: string): string[] {
  const out: string[] = [];
  for (const fn of namesOf(source).functions) {
    for (const o of fn.occurrences) {
      if (o.name !== name) continue;
      const targets = o.declarations.map(
        (d) => `${d.kind}@L${lineOf(source, d.nameFrom)}`,
      );
      out.push(
        `L${lineOf(source, o.from)} ${o.kind} -> ${targets.join(", ") || "global"}`,
      );
    }
  }
  return out;
}

describe("occurrences resolve to their declarations", () => {
  test("an inner local hides an outer one only inside its block", () => {
    const source = `function run()
  local x = 1
  do
    local x = 2
    print(x)
  end
  print(x)
end
`;
    expect(resolutions(source, "x")).toEqual([
      "L5 read -> local@L4",
      "L7 read -> local@L2",
    ]);
  });

  test("a nested function sees its own locals and the enclosing ones", () => {
    const source = `function outer(a)
  local b = a
  local function inner(c)
    local a = c
    return a + b
  end
  return inner(a)
end
`;
    expect(resolutions(source, "a")).toEqual([
      "L2 read -> parameter@L1",
      "L5 read -> local@L4",
      "L7 read -> parameter@L1",
    ]);
    expect(resolutions(source, "b")).toEqual(["L5 read -> local@L2"]);
    expect(resolutions(source, "c")).toEqual(["L4 read -> parameter@L3"]);
    expect(resolutions(source, "inner")).toEqual([
      "L7 read -> localFunction@L3",
    ]);
  });

  test("a local declared in a `repeat` body is seen by its `until`", () => {
    const source = `function run()
  repeat
    local done = check()
  until done
  return done
end
`;
    expect(resolutions(source, "done")).toEqual([
      "L4 read -> local@L3",
      "L5 read -> global",
    ]);
  });

  test("a loop variable is seen only in the loop body", () => {
    const source = `function run(t)
  for i, v in t do
    print(i, v)
  end
  return i
end
`;
    expect(resolutions(source, "i")).toEqual([
      "L3 read -> loopVariable@L2",
      "L5 read -> global",
    ]);
  });

  test("one-line forms resolve to the local the line declares", () => {
    const source = `function run()
  local s, r = f() return r
end
function other()
  local a = 1 function foo() return a end
end
`;
    expect(resolutions(source, "r")).toEqual(["L2 read -> local@L2"]);
    expect(resolutions(source, "a")).toEqual(["L5 read -> local@L5"]);
  });

  test("a name in a local's own initializer can be either declaration", () => {
    const source = `function run(x)
  local x = x + 1
  return x
end
`;
    expect(resolutions(source, "x")).toEqual([
      "L2 read -> local@L2, parameter@L1",
      "L3 read -> local@L2",
    ]);
  });

  test("writes, compound writes and function statements are told apart", () => {
    const source = `function run()
  local n = 0
  n = 1
  n += 2
  local f
  function f() end
  total = n
end
`;
    expect(resolutions(source, "n")).toEqual([
      "L3 write -> local@L2",
      "L4 compoundWrite -> local@L2",
      "L7 read -> local@L2",
    ]);
    expect(resolutions(source, "f")).toEqual(["L6 functionName -> local@L5"]);
    expect(resolutions(source, "total")).toEqual(["L7 write -> global"]);
  });

  test("fields, methods, strings and comments are not occurrences", () => {
    const source = `function run(x)
  print(t.x, t:x(), "x", \`x\`) -- x
  return \`{x}\`
end
`;
    expect(resolutions(source, "x")).toEqual(["L3 read -> parameter@L1"]);
  });

  test("a local the grammar nests inside another statement is still a local", () => {
    const source = `function run()
  local a = {} local b = a
  & local x = 5
  return b, x
end
`;
    expect(resolutions(source, "b")).toEqual(["L4 read -> local@L2"]);
    expect(resolutions(source, "x")).toEqual(["L4 read -> local@L3"]);
    expect([...namesOf(source).globalOccurrences.keys()]).toEqual([]);
  });

  test("keywords and names in types are not occurrences", () => {
    const source = `function run(t)
  for _, v in t do if v then continue end end
  type Point = { x: number }
  local p: Point = nil
  store w = 2
  return p
end
`;
    const names = namesOf(source);
    expect(
      names.functions[0]!.occurrences.map((o) => o.name),
    ).toEqual(["t", "v", "p"]);
    expect([...names.globalOccurrences.keys()]).toEqual([]);
  });

  test("a nested local hides no outer local of the same name", () => {
    const source = `function run()
  local x = 1
  local a = {} local x = 3
  print(x, a)
end
`;
    expect(resolutions(source, "x")).toEqual(["L4 read -> local@L3, local@L2"]);
  });

  test("a structural word is a name where it is used as one", () => {
    const source = `function run(t)
  local style = t.s
  setStyle(style)
  print(layout)
  if screen then setStyle(style) end
end
`;
    expect(resolutions(source, "style")).toEqual([
      "L3 read -> local@L2",
      "L5 read -> local@L2",
    ]);
    expect([...namesOf(source).globalOccurrences.keys()].sort()).toEqual([
      "layout",
      "print",
      "screen",
      "setStyle",
    ]);
  });

  test("a keyword statement nested on another's line is not a use", () => {
    const source = `function run()
  local a = {} store x = 1
  local b = {} type T = { y: number }
  for i = 1, 3 do local c = 1 continue end
  return a, b
end
`;
    expect([...namesOf(source).globalOccurrences.keys()]).toEqual([]);
  });

  test("`self` is a method's parameter, or a local of that name", () => {
    const source = `function run()
  local q = {}
  function q:m() return self end
  local self = q
  return self
end
`;
    expect(resolutions(source, "self")).toEqual([
      "L3 read -> parameter@L3",
      "L5 read -> local@L4",
    ]);
  });

  test("`store` inside a function defines the global, not a read of a local", () => {
    const source = `function run()
  local w = 1
  store w = 2
end
`;
    const names = namesOf(source);
    expect(resolutions(source, "w")).toEqual([]);
    expect(names.globalDefinitions.map((d) => `${d.name}:${d.kind}`)).toEqual([
      "run:function",
      "w:store",
    ]);
  });

  test("a function that is not closed has no occurrences", () => {
    const source = `function run()
  local x = 1
  if x then
`;
    const [fn] = namesOf(source).functions;
    expect(fn!.closed).toBe(false);
    expect(fn!.occurrences).toEqual([]);
  });
});

/** The uses of `name` across `scripts`, as `<uri>:L<line> <kind> in <fn>`. */
function usesAcross(scripts: Record<string, string>, name: string) {
  const index = indexProgramNames(
    Object.entries(scripts).map(([uri, source]) => ({
      uri,
      names: namesOf(source),
    })),
  );
  const global = index.get(name);
  return {
    definitions: (global?.definitions ?? []).map(
      ({ uri, definition }) =>
        `${uri}:L${lineOf(scripts[uri]!, definition.nameFrom)} ${definition.kind}`,
    ),
    uses: (global?.uses() ?? []).map(({ uri, occurrence, fn }) => {
      const where = fn
        ? scripts[uri]!.slice(fn.node.from, fn.node.to).match(
            /function\s+(\w+)/,
          )![1]
        : "top level";
      return `${uri}:L${lineOf(scripts[uri]!, occurrence.from)} ${occurrence.kind} in ${where}`;
    }),
  };
}

const GREET = `function greet(name)
  return "hello " .. name
end
`;

describe("the program index finds every use of a global", () => {
  test("a call from another script's function", () => {
    expect(
      usesAcross(
        {
          "a.sd": GREET,
          "b.sd": `function run()
  greet("you")
end
`,
        },
        "greet",
      ),
    ).toEqual({
      definitions: ["a.sd:L1 function"],
      uses: ["b.sd:L2 read in run"],
    });
  });

  test("a call from a narrative logic line", () => {
    expect(
      usesAcross({ "a.sd": GREET, "b.sd": `Hi there.\n& greet("you")\n` }, "greet"),
    ).toEqual({
      definitions: ["a.sd:L1 function"],
      uses: ["b.sd:L2 read in top level"],
    });
  });

  test("a Sparkle handler, by name and as a call", () => {
    expect(
      usesAcross(
        {
          "a.sd": GREET,
          "b.sd": `layout hud with
  row:
    button "Go" @click=greet
    button "Hi" @click=greet("you")
end
`,
        },
        "greet",
      ),
    ).toEqual({
      definitions: ["a.sd:L1 function"],
      uses: ["b.sd:L3 read in top level", "b.sd:L4 read in top level"],
    });
  });

  test("a stored global read in an interpolation and written by a logic line", () => {
    expect(
      usesAcross(
        {
          "a.sd": `store hp = 100
function hurt(n)
  hp -= n
end
`,
          "b.sd": `You have {hp} left.\n& hp = 5\n`,
        },
        "hp",
      ),
    ).toEqual({
      definitions: ["a.sd:L1 store"],
      uses: [
        "a.sd:L3 compoundWrite in hurt",
        "b.sd:L1 read in top level",
        "b.sd:L2 write in top level",
      ],
    });
  });

  test("a global named after a Sparkdown word, in an interpolation and a logic line", () => {
    expect(
      usesAcross(
        {
          "a.sd": `store match = 1\n`,
          "b.sd": `It was a match.\nYou have {match} left.\n& match("you")\n`,
        },
        "match",
      ),
    ).toEqual({
      definitions: ["a.sd:L1 store"],
      uses: ["b.sd:L2 read in top level", "b.sd:L3 read in top level"],
    });
  });

  test("prose, strings, fields and a local of the same name are not uses", () => {
    expect(
      usesAcross(
        {
          "a.sd": GREET,
          "b.sd": `We greet the guests.
function run(t)
  local greet = t.greet
  print("greet", greet)
end
`,
        },
        "greet",
      ),
    ).toEqual({ definitions: ["a.sd:L1 function"], uses: [] });
  });

  test("a global assigned in a function is indexed without a definition", () => {
    expect(
      usesAcross(
        {
          "a.sd": `function run()
  total = 1
end
`,
        },
        "total",
      ),
    ).toEqual({ definitions: [], uses: ["a.sd:L2 write in run"] });
  });
});
