import { describe, expect, it } from "vitest";
import type { RaisedError } from "../../runtime/Error";
import { testCompiler, testStory } from "../engineUnderTest";

const URI = "inmemory:///main.sd";

function compile(text: string) {
  const c = testCompiler();
  c.configure({
    useBuiltinsPrelude: true,
    seedBuiltinsIntoStory: true,
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  } as never);
  const program = (c.compile({ textDocument: { uri: URI } } as never) as any)
    .program;
  if (!program.chunks) {
    throw new Error(
      "fixture failed to compile: " + JSON.stringify(program.diagnostics),
    );
  }
  return program;
}

const addressesOn = (program: any, line: number): number[] => {
  const root = program.chunks!;
  const address = root.addressAt(URI, line);
  const location = address === undefined ? undefined : root.locationOf(address);
  return location?.uri === URI && location.startLine === line ? [address!] : [];
};

const matching = (program: any, pattern: RegExp): any[] =>
  ((program.diagnostics?.[URI] ?? []) as any[]).filter((d) =>
    pattern.test(d.message?.value ?? d.message ?? ""),
  );

const warningsMatching = (program: any, pattern: RegExp): number[] =>
  matching(program, pattern).map((d) => d.range.start.line);

const diagnosticsMatching = (program: any, pattern: RegExp) =>
  matching(program, pattern).map((d) => ({
    line: d.range.start.line,
    character: d.range.start.character,
    severity: d.severity,
  }));

function runText(program: any): string {
  const story = testStory(program.chunks);
  let text = "";
  for (let step = 0; step < 100 && story.canContinue; step++) {
    text += story.Continue();
  }
  return text;
}

function raisedAddress(program: any): number | undefined {
  const story = testStory(program.chunks);
  let raised: RaisedError | null | undefined;
  story.onError = (_message, _type, _source, record) => {
    raised ??= record;
  };
  for (let step = 0; step < 100 && raised === undefined; step++) {
    if (story.canContinue) {
      story.Continue();
    } else if (story.currentChoices.length > 0) {
      story.ChooseChoiceIndex(0);
    } else {
      break;
    }
  }
  return raised?.address ?? undefined;
}

function raisedLine(source: string): number | undefined {
  const program = compile(source);
  const address = raisedAddress(program);
  expect(address, "the story did not raise").toBeDefined();
  const location = program.chunks!.locationOf(address!);
  expect(location, `no location for raised address ${address}`).toBeDefined();
  expect(location!.uri).toBe(URI);
  return location!.startLine;
}

describe("logic lines own their instructions' addresses (#824)", () => {
  it("an error raised by a logic line resolves to that line", () => {
    expect(raisedLine(`A\n& error("boom")\nC\n`)).toBe(1);
  });

  it("a reassignment logic line has an address on it", () => {
    const program = compile(`store x = 0\nA\n& x = 1\n.. B\n`);
    expect(addressesOn(program, 2)).not.toEqual([]);
  });

  it("a function-call logic line has an address on it", () => {
    const program = compile(`A\n& print("hi")\nC\n`);
    expect(addressesOn(program, 1)).not.toEqual([]);
  });

  it("an error raised by a logic line in a scene body resolves to that line", () => {
    expect(
      raisedLine(`-> start\n\nscene start\n  A\n  & error("boom")\n  C\nend\n`),
    ).toBe(4);
  });

  it("an error raised by a property assignment logic line resolves to that line", () => {
    expect(raisedLine(`store t = {}\nA\n& t.x = error("boom")\nC\n`)).toBe(2);
  });

  it("a property assignment logic line has an address on it", () => {
    const program = compile(`store t = {}\nA\n& t.x = 1\nC\n`);
    expect(addressesOn(program, 2)).not.toEqual([]);
  });

  it("an error raised by a logic line in a choice body resolves to that line", () => {
    expect(
      raisedLine(`A\nchoose\n  + [Go]\n    & error("boom")\nthen\nC\n`),
    ).toBe(3);
  });

  it("an error raised by a logic line in a queue arm resolves to that line", () => {
    expect(raisedLine(`A\nqueue\n  |\n    & error("boom")\nend\nC\n`)).toBe(3);
  });

  it("a function value assigned on a logic line gets no divert-target hint", () => {
    const program = compile(`A\n& f = function() return 1 end\nC\n`);
    expect(warningsMatching(program, /divert target like that/)).toEqual([]);
  });

  it("an authored divert target misused on a logic line still gets the hint, as a warning on the target", () => {
    const program = compile(
      `store x = 0\nA\n& x = (-> later) + 1\nC\n-> DONE\n\nscene later\n  B\nend\n`,
    );
    expect(diagnosticsMatching(program, /divert target like that/)).toEqual([
      { line: 2, character: 10, severity: 2 },
    ]);
  });

  it("a `& local` declaration's warning reaches the editor on its target", () => {
    const program = compile(
      `A\n& local x = (-> later) + 1\nC\n-> DONE\n\nscene later\n  B\nend\n`,
    );
    expect(diagnosticsMatching(program, /divert target like that/)).toEqual([
      { line: 1, character: 16, severity: 2 },
    ]);
  });

  it("an error raised by a `& local` declaration resolves to that line", () => {
    expect(raisedLine(`A\n& local x = error("boom")\nC\n`)).toBe(1);
  });

  it("a `& local` shadowed in a block reports no duplicate identifier and reads the right binding", () => {
    const program = compile(
      `& local x = 1\nif true then\n  & local x = 2\n  Inner {x}.\nend\nOuter {x}.\n`,
    );
    expect(diagnosticsMatching(program, /Duplicate identifier/)).toEqual([]);
    expect(runText(program)).toBe("Inner 2.\nOuter 1.\n");
  });

  it("a `& local` declared again in the same block reports no duplicate identifier", () => {
    const program = compile(`& local x = 1\n& local x = x + 1\nValue {x}.\n`);
    expect(diagnosticsMatching(program, /Duplicate identifier/)).toEqual([]);
    expect(runText(program)).toBe("Value 2.\n");
  });

  it("a definition's assignments get no address", () => {
    const program = compile(`define thing with\n  value = 1\nend\n`);
    expect(addressesOn(program, 1)).toEqual([]);
  });
});
