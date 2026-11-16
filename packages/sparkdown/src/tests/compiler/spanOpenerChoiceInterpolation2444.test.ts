import { describe, expect, test } from "vitest";
import { testCompiler, testStory } from "../engineUnderTest";
import { parseSource } from "./grammarSnapshot";
import { treeScopeStackAt, vscodeScopeStacksPerChar } from "./scopeEquality";

const displayScript = (line: string) => `store a = "x"\nscene start\n  ${line}\n  done\nend\n`;

const choiceScript = (text: string) =>
  `store a = "x"\nscene start\n  choose\n    + ${text}\n      Body.\n      done\n  end\nend\n`;

const ITALIC = "markup.other.italic.sd";

async function italicRuns(source: string, text: string) {
  const from = source.indexOf(text);
  const tree = parseSource(source);
  const vscode = await vscodeScopeStacksPerChar(source);
  const runs = (italicAt: (i: number) => boolean) => {
    let out = "";
    for (let i = from; i < from + text.length; i++) out += italicAt(i) ? source[i] : " ";
    return out.trim();
  };
  return {
    tree: runs((i) => treeScopeStackAt(tree, i).includes(ITALIC)),
    vscode: runs((i) => (vscode[i] ?? []).includes(ITALIC)),
  };
}

const nodesOver = (source: string, name: string) => {
  const found: string[] = [];
  parseSource(source).iterate({
    enter: (node) => {
      if (node.name === name) found.push(source.slice(node.from, node.to).trim());
    },
  });
  return found;
};

const compileStory = (text: string) => {
  const compiler = testCompiler();
  compiler.configure({
    files: [
      { uri: "inmemory:///main.sd", type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" } as any,
    ],
  });
  const story = testStory(compiler.compile({ textDocument: { uri: "inmemory:///main.sd" } }).program.chunks);
  return story;
};

describe("a styled span holding an unclosed doubled opener is read as a span (I-2424)", () => {
  test.each([
    ["*a [[b*", "*a [[b*"],
    ["*a ((b*", "*a ((b*"],
    ["Go *a [[b* now", "*a [[b*"],
    ["Go *a ((b* now", "*a ((b*"],
    ["*a [b*", "*a [b*"],
    ["*a [[b]]*", "*a [[b]]*"],
  ])("on a display line: `%s`", async (line, italic) => {
    expect(await italicRuns(displayScript(line), line)).toEqual({ tree: italic, vscode: italic });
  });

  test.each([
    ["Go *a [[b* now", "*a [[b*"],
    ["Go *a ((b* now", "*a ((b*"],
  ])("in choice text: `+ %s`", async (text, italic) => {
    expect(await italicRuns(choiceScript(text), text)).toEqual({ tree: italic, vscode: italic });
  });
});

describe("a directive holding an interpolation reads the same on a display line and on a choice line (I-2425)", () => {
  test.each([
    "((a {[[a]]} b))",
    "((a {[=[a]=]} b))",
    "((a {1 --[[c]] + 1} b))",
    "((a {t[1]} b))",
    `((a {"}" .. [[a]]} b))`,
    `((a {'{' .. [[a]]} b))`,
    `((a {"[x]" .. [[a]]} b))`,
    "((a {`{1}` .. [[a]]} b))",
    "((a {`{1}` .. [[a -> b]]} b))",
    "((a {`\\}` .. [[a]]} b))",
    "((a {1 /* } */ .. [[a]]} b))",
    "((a {[[}]]} b))",
    "((a {[=[}]=] .. '->'} b))",
    "((a {[=[x]]} -> y]=]} b))",
    "((a {[[x]=]} -> y]]} b))",
    "((a {[==[x]=]} -> y]==]} b))",
    "((a {[[{}]]} b))",
    "((a {[=[{x}]=]} b))",
    "((a {[==[{x}]==]} b))",
    "((a {1 --[[{}]] + 1} b))",
    "((a {[[{}]] .. '->'} b))",
  ])(
    "`%s`",
    (directive) => {
      expect(nodesOver(displayScript(directive), "AudioCommand")).toEqual([directive]);
      expect(nodesOver(choiceScript(`Go ${directive} now`), "AudioCommand")).toEqual([directive]);
      expect(nodesOver(choiceScript(`Go [${directive}] now`), "AudioCommand")).toEqual([directive]);
      expect(nodesOver(choiceScript(`Go [x] ${directive} now`), "AudioCommand")).toEqual([directive]);
    },
  );

  test("a closer inside an interpolation ends the directive there on both line kinds", () => {
    const line = "((a {f(g(x))} b))";
    expect(nodesOver(displayScript(line), "AudioCommand")).toEqual(["((a {f(g(x))"]);
    expect(nodesOver(choiceScript(`Go ${line} now`), "AudioCommand")).toEqual(["((a {f(g(x))"]);
  });

  test.each([
    ["Go <wait {[[x> [y] ]]} > now", "Go <wait x> [y] > now"],
    ["Go ((a {[[x)) [y] ]]} b)) now", "Go ((a x)) [y] b)) now"],
  ])(
    "a command's closer inside a long-string interpolation ends the command first, as on a display line, and a bracket left inside it reads no directive: `+ %s`",
    (text, label) => {
      const story = compileStory(choiceScript(text));
      story.ContinueMaximally();
      expect(story.currentChoices.map((choice: { text: string }) => choice.text)).toEqual([label]);
      expect(nodesOver(choiceScript(text), "AudioCommand")).toEqual([]);
    },
  );

  test.each(["[[a {t[ [=[x]=]]} b]]", "[[a {t[ [==[x]==]]} b]]"])(
    "an image closer that starts inside a long bracket's closer ends the command there, so the interpolation is not taken whole: `+ Go [%s] now`",
    (directive) => {
      const script = (text: string) => `store t = {x = "hit"}\nscene start\n  choose\n    + ${text}\n      Body.\n      done\n  end\nend\n`;
      expect(nodesOver(script(`Go [${directive}] now`), "ImageCommand")).toEqual([]);
      const story = compileStory(script(`Go [${directive}] now`));
      story.ContinueMaximally();
      expect(story.currentChoices.map((choice: { text: string }) => choice.text)).toEqual(["Go [[a hit b"]);
    },
  );

  test("an escaped `>` inside a long-string interpolation ends no text command, as on a display line", () => {
    const directive = "<wait {[[x\\>y]]}>";
    expect(nodesOver(displayScript(directive), "TextCommand")).toEqual([directive]);
    expect(nodesOver(choiceScript(`Go ${directive} now`), "TextCommand")).toEqual([directive]);
    expect(nodesOver(choiceScript(`Go [${directive}] now`), "TextCommand")).toEqual([directive]);
    expect(nodesOver(choiceScript(`Go [x] ${directive} now`), "TextCommand")).toEqual([directive]);
  });

  test.each(["Go ((a {[[a]]} b)) now", "Go ((a {[=[a]=]} b)) now", "Go ((a {1 --[[c]] + 1} b)) now", "Go ((a {t[1]} b)) now"])(
    "the choice shows the directive's text unevaluated: `+ %s`",
    (text) => {
      const story = compileStory(choiceScript(text));
      story.ContinueMaximally();
      expect(story.currentChoices.map((choice: { text: string }) => choice.text)).toEqual([text]);
    },
  );
});
