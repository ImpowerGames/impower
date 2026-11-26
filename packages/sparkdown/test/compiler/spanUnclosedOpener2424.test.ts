import { describe, expect, test } from "vitest";
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
