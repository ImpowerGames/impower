import { describe, expect, test } from "vitest";
import type { SparkProgram } from "../../src/compiler/types/SparkProgram";
import { MAIN_URI, programCompiler } from "../program/programHarness";

const UNREACHABLE = "Unreachable statement detected.";
const OTHER_URI = "inmemory:///other.sd";

const messageOf = (d: { message: string | { value: string } }) =>
  typeof d.message === "string" ? d.message : d.message.value;

const unreachable = (program: SparkProgram, uri = MAIN_URI): string[] =>
  (program.diagnostics?.[uri] ?? [])
    .filter((d) => messageOf(d) === UNREACHABLE)
    .map((d) => `${d.severity} ${JSON.stringify(d.tags)} ${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character}`)
    .sort();

const errors = (program: SparkProgram): string[] =>
  Object.values(program.diagnostics ?? {})
    .flat()
    .filter((d) => d.severity === 1)
    .map(messageOf);

const compile = (texts: Record<string, string>) => {
  const { program } = programCompiler(texts).compile();
  return program;
};

const hintsIn = (source: string) => {
  const program = compile({ [MAIN_URI]: source });
  expect(errors(program)).toEqual([]);
  return unreachable(program);
};

const HINT = "4 [1]";

describe("a branch nothing reaches", () => {
  test("is a faded hint from its header line to its end", () => {
    expect(
      hintsIn(`scene start
  Hello.
  branch lonely
    Never.
  end
end
`),
    ).toEqual([`${HINT} 2:0-4:5`]);
  });

  test("is a hint when only the branch itself diverts to it", () => {
    expect(
      hintsIn(`scene start
  Hello.
  branch loop
    Again.
    -> loop
  end
end
`),
    ).toEqual([`${HINT} 2:0-5:5`]);
  });

  test("is a hint when only another unreached branch diverts to it", () => {
    expect(
      hintsIn(`scene start
  Hello.
  branch first
    -> second
  end
  branch second
  end
end
`),
    ).toEqual([`${HINT} 2:0-4:5`, `${HINT} 5:0-6:5`]);
  });

  test("does not stop the story from compiling or playing", () => {
    const program = compile({
      [MAIN_URI]: `scene start
  Hello.
  branch lonely
  end
end
`,
    });
    expect(errors(program)).toEqual([]);
    expect(program.chunks).toBeTruthy();
  });
});

describe("a reached branch has no unreachable hint", () => {
  test.each([
    ["a divert", "  -> b"],
    ["a tunnel", "  -> b ->"],
    ["a tunnel chain that ends on it", "  -> a -> b"],
    ["a thread", "  <- b"],
    ["a choice", "  choose\n    * [Go] -> b\n  end"],
    ["a divert-target value", "  local where = -> b\n  -> where"],
    ["a divert from a reached branch", "  -> a"],
  ])("reached by %s", (_kind, line) => {
    const source = `scene start
${line}
  branch a
    -> b
  end
  branch b
    In b.
  end
end
`;
    const header = source.split("\n").indexOf("  branch b");
    expect(hintsIn(source).filter((hint) => hint.includes(` ${header}:0-`))).toEqual([]);
  });

  test("reached by its scene-qualified name from another scene", () => {
    expect(
      hintsIn(`scene start
  -> other.b
end
scene other
  branch b
  end
end
`),
    ).toEqual([]);
  });

  test("reached from another script", () => {
    const program = compile({
      [MAIN_URI]: `scene start
  -> other.b
end
`,
      [OTHER_URI]: `scene other
  branch b
  end
end
`,
    });
    expect(errors(program)).toEqual([]);
    expect(unreachable(program, OTHER_URI)).toEqual([]);
  });

  test("reached by a divert to a label inside it", () => {
    expect(
      hintsIn(`scene start
  -> b.spot
  branch b
    Skipped.
    label spot
    Here.
  end
end
`),
    ).toEqual([]);
  });

  test("reached by a divert with arguments", () => {
    expect(
      hintsIn(`scene start
  -> greet("Ann")
  branch greet(name)
    Hi {name}.
  end
end
`),
    ).toEqual([]);
  });

  test("a scene nothing diverts to is never reported", () => {
    expect(
      hintsIn(`scene start
  Hello.
end
scene alone
  Alone.
end
`),
    ).toEqual([]);
  });
});

describe("lines after a divert that leaves the flow", () => {
  test.each([
    ["a divert", "-> s"],
    ["a tunnel chain ending on a divert", "-> s -> s"],
    ["a tunnel onwards", "->->"],
    ["a tunnel onwards to a target", "->-> s"],
  ])("are a faded hint after %s, up to the next branch", (_kind, divert) => {
    expect(
      hintsIn(`scene start
  -> s
end
scene s
  ${divert}
  Never.

  Nor this.
  branch b
  end
end
`).filter((hint) => !hint.includes(" 8:0-")),
    ).toEqual([`${HINT} 5:0-7:11`]);
  });

  test.each([
    ["an action line", "  Hello -> s"],
    ["a dialogue line", "  HERO: Hello -> s"],
    ["a dialogue block", "  HERO:\n    Hello -> s"],
  ])("are a faded hint after a divert that ends %s", (_kind, line) => {
    const source = `scene start
${line}
  Never.
end
scene s
end
`;
    const never = source.split("\n").indexOf("  Never.");
    expect(hintsIn(source)).toEqual([`${HINT} ${never}:0-${never}:8`]);
  });

  test.each([
    ["a tunnel followed by a tunnel onwards", "  -> s -> ->"],
    ["a display line ending on a tunnel followed by a tunnel onwards", "  Hello -> s -> ->"],
  ])("are a faded hint after %s", (_kind, line) => {
    expect(
      hintsIn(`scene start
  -> t ->
  Back.
end
scene t
${line}
  Never.
end
scene s
  ->->
end
`),
    ).toEqual([`${HINT} 6:0-6:8`]);
  });

  test("are not a hint after a display line that tunnels and returns", () => {
    expect(
      hintsIn(`scene start
  Hello -> s ->
  Reached.
end
scene s
  ->->
end
`),
    ).toEqual([]);
  });

  test("are a faded hint up to the end of the body that holds the divert", () => {
    expect(
      hintsIn(`store x = true
scene start
  if x then
    -> s
    Never.
  end
  Reached.
end
scene s
end
`),
    ).toEqual([`${HINT} 4:0-4:10`]);
  });

  test("stop at a label, which a divert can reach", () => {
    expect(
      hintsIn(`store x = 1
scene start
  if x == 1 then
    -> s
    Never.
    label meet
    Reached.
  end
  -> meet
end
scene s
end
`),
    ).toEqual([`${HINT} 4:0-4:10`]);
  });

  test.each([["a tunnel", "-> s ->"], ["a tunnel chain", "-> s -> s ->"], ["a tunnel chain with arguments", "-> t(1) -> t(2) ->"]])(
    "are not a hint after %s that returns",
    (_kind, tunnel) => {
      expect(
        hintsIn(`scene start
  ${tunnel}
  Reached.
end
scene s
  ->->
end
scene t(n)
  ->->
end
`),
      ).toEqual([]);
    },
  );

  test.each(["-> s", "done"])("stop at the next arm of an if after `%s`", (leaves) => {
    expect(
      hintsIn(`store x = 1
scene start
  if x == 1 then
    ${leaves}
    Never.
  elseif x == 2 then
    Two.
  else
    Other.
  end
end
scene s
end
`),
    ).toEqual([`${HINT} 4:0-4:10`]);
  });

  test.each([
    ["the next choice after `-> s`", "  choose\n    * [A]\n      -> s\n      Never.\n    * [B]\n      Bee.\n  end"],
    ["the next choice after `fin`", "  choose\n    * [A]\n      fin\n      Never.\n    * [B]\n      Bee.\n  end"],
    ["the next match arm", "  match x\n  | 1\n    -> s\n    Never.\n  | 2\n    Two.\n  end"],
    ["the next queue arm after a divert on the arm's line", "  queue\n  | A -> s\n    Never.\n  | B\n  end"],
  ])("stop at %s", (_kind, body) => {
    const source = `store x = 1
scene start
${body}
end
scene s
end
`;
    const lines = source.split("\n");
    const never = lines.findIndex((line) => line.trim() === "Never.");
    expect(hintsIn(source)).toEqual([`${HINT} ${never}:0-${never}:${lines[never]!.length}`]);
  });

  test("are not a hint after a thread", () => {
    expect(
      hintsIn(`scene start
  <- s
  Reached.
end
scene s
end
`),
    ).toEqual([]);
  });

  test("are not a hint after a choice's divert", () => {
    expect(
      hintsIn(`scene start
  choose
    * [Go] -> s
  end
  Reached.
end
scene s
end
`),
    ).toEqual([]);
  });
});

describe("the unreachable hints of an incremental compile", () => {
  const PAD = Array.from({ length: 4 }, (_, n) => `scene pad${n}\n  Pad ${n}.\nend\n`).join("");
  const START = `${PAD}scene start
  Hello.
  -> s
  After.
  branch b
    In b.
  end
end
scene s
  Line.
end
`;

  const edits: [string, string, string][] = [
    ["a divert to the branch is added", "  Line.\n", "  Line.\n  -> start.b\n"],
    ["the branch is renamed", "branch b", "branch c"],
    ["an unrelated line is reworded", "Pad 1.", "Pad one."],
    ["the divert is removed", "  -> s\n", ""],
  ];

  test.each(edits)("match a cold compile after %s", (_name, find, replace) => {
    const session = programCompiler({ [MAIN_URI]: START });
    session.compile();
    let text = START;
    let version = 2;
    const apply = (from: string, to: string) => {
      const at = text.indexOf(from);
      expect(at).toBeGreaterThanOrEqual(0);
      const position = (offset: number) => {
        const before = text.slice(0, offset);
        return {
          line: before.split("\n").length - 1,
          character: offset - (before.lastIndexOf("\n") + 1),
        };
      };
      session.compiler.updateDocument({
        textDocument: { uri: MAIN_URI, version: version++ },
        contentChanges: [
          { range: { start: position(at), end: position(at + from.length) }, text: to },
        ],
      });
      text = text.slice(0, at) + to + text.slice(at + from.length);
      expect(unreachable(session.compile().program)).toEqual(
        unreachable(compile({ [MAIN_URI]: text })),
      );
    };
    apply(find, replace);
    apply("Hello.", "Hello there.");
  });

  test("keep a branch reached through a value held by a statement served from its memo", () => {
    const pad = Array.from({ length: 8 }, (_, n) => `scene pad${n}\n  Pad ${n}.\nend\n`).join("");
    const text = `${pad}store flag = true
scene start
  if flag then
    local dest = -> b
    -> dest
    Touch.
  end
  branch b
    In b.
  end
end
`;
    const session = programCompiler({ [MAIN_URI]: text });
    session.compile();
    const at = text.indexOf("Touch.");
    const before = text.slice(0, at);
    const line = before.split("\n").length - 1;
    const character = at - (before.lastIndexOf("\n") + 1);
    session.compiler.updateDocument({
      textDocument: { uri: MAIN_URI, version: 2 },
      contentChanges: [
        { range: { start: { line, character }, end: { line, character: character + 6 } }, text: "Other." },
      ],
    });
    const edited = text.replace("Touch.", "Other.");
    const incremental = unreachable(session.compile().program);
    expect(incremental).toEqual(unreachable(compile({ [MAIN_URI]: edited })));
    expect(incremental).toEqual([`${HINT} ${line}:0-${line}:10`]);
  });

  test("keep a same-named branch in another scene marked when a statement served from its memo reaches its own", () => {
    const pad = Array.from({ length: 8 }, (_, n) => `scene pad${n}\n  Pad ${n}.\nend\n`).join("");
    const text = `scene other
  branch b
    Elsewhere.
  end
end
${pad}store flag = true
scene start
  if flag then
    local dest = -> b
    -> dest
    Touch.
  end
  branch b
    In b.
  end
end
`;
    const session = programCompiler({ [MAIN_URI]: text });
    session.compile();
    const at = text.indexOf("Touch.");
    const before = text.slice(0, at);
    const line = before.split("\n").length - 1;
    const character = at - (before.lastIndexOf("\n") + 1);
    session.compiler.updateDocument({
      textDocument: { uri: MAIN_URI, version: 2 },
      contentChanges: [
        { range: { start: { line, character }, end: { line, character: character + 6 } }, text: "Other." },
      ],
    });
    const edited = text.replace("Touch.", "Other.");
    const incremental = unreachable(session.compile().program);
    expect(incremental).toEqual(unreachable(compile({ [MAIN_URI]: edited })));
    expect(incremental).toEqual([`${HINT} 1:0-3:5`, `${HINT} ${line}:0-${line}:10`]);
  });

  test("follow a divert added to the branch in another script", () => {
    const session = programCompiler({
      [MAIN_URI]: START,
      [OTHER_URI]: "scene other\n  Other.\nend\n",
    });
    expect(unreachable(session.compile().program)).toEqual([`${HINT} 15:0-15:8`, `${HINT} 16:0-18:5`]);
    session.compiler.updateDocument({
      textDocument: { uri: OTHER_URI, version: 2 },
      contentChanges: [
        { range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } }, text: "  -> start.b\n" },
      ],
    });
    expect(unreachable(session.compile().program)).toEqual([`${HINT} 15:0-15:8`]);
  });
});
