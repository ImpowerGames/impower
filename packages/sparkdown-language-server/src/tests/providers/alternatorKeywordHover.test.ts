import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, it } from "vitest";
import {
  ALTERNATOR_KEYWORDS,
  alternatorKeywordDocumentation,
} from "../../utils/providers/alternatorKeywordHelp";
import { getHover } from "../../utils/providers/getHover";
import { complete } from "./completionHarness";

let version = 0;

const hoverAt = async (text: string, index: number) => {
  const uri = `file:///alternator${++version}.sd`;
  const documents = new SparkdownDocumentRegistry(["references"]);
  documents.set({ textDocument: { uri, text, version, languageId: "sparkdown" } });
  const document = documents.get(uri)!;
  const hover = await getHover(
    document,
    documents.tree(uri),
    documents.annotations(uri),
    undefined,
    undefined,
    document.positionAt(index),
  );
  if (!hover) {
    return null;
  }
  const contents = hover.contents as { value: string };
  return {
    value: contents.value,
    marked: document.getText(hover.range),
  };
};

const at = (text: string, needle: string, from = 0) => text.indexOf(needle, from);

describe("alternator keyword hover", () => {
  it("names the one-line and multi-line forms of each keyword", async () => {
    const lines = [
      "queue | In A. | In B. end",
      "cycle\n| In A.\n| In B.\nend",
      "chain | In A. | In B. end",
      "shuffle | In A. | In B. end",
      "match(mood)\n| happy = Smile.\n| other = Wait.\nend",
      "plural(coins) | one = A coin. | other = Coins. end",
    ];
    for (const text of lines) {
      const keyword = text.split(/[\s(]/)[0]!;
      const hover = await hoverAt(text, 1);
      expect(hover?.marked, text).toBe(keyword);
      expect(hover?.value, text).toContain(`\`${keyword}\` shows`);
      expect(hover?.value, text).toContain("One line:");
      expect(hover?.value, text).toContain("Several lines:");
      expect(hover?.value, text).toContain("At the start of an option");
    }
  });

  it("advertises only examples that open the set they describe", async () => {
    for (const keyword of ALTERNATOR_KEYWORDS) {
      const documentation = alternatorKeywordDocumentation(keyword);
      const examples = [
        /One line: `([^`]+)`/.exec(documentation)?.[1],
        /```sparkdown\n([\s\S]*?)\n```/.exec(documentation)?.[1],
        /Inside a line: `([^`]+)`/.exec(documentation)?.[1],
      ].filter((example): example is string => example !== undefined);
      expect(examples.length, keyword).toBeGreaterThanOrEqual(2);
      for (const example of examples) {
        const hover = await hoverAt(example, example.indexOf(keyword) + 1);
        expect(hover?.marked, example).toBe(keyword);
      }
      const nested = /`(cycle \| [^`]+ end \| C\. end)`/.exec(documentation)?.[1];
      expect(nested, keyword).toBeDefined();
      const inner = await hoverAt(nested!, nested!.indexOf(keyword, 1) + 1);
      expect(inner?.value, nested).toContain("starts an option of the `cycle` around it");
    }
  });

  it("explains the keyword of an inline glued set and of a `shuffle queue`", async () => {
    const inline = "Hello .. queue|a|b .. there.";
    expect((await hoverAt(inline, at(inline, "queue") + 2))?.marked).toBe("queue");
    const shuffled = "shuffle queue | a | b end";
    const hover = await hoverAt(shuffled, at(shuffled, "queue"));
    expect(hover?.marked).toBe("queue");
    expect(hover?.value).toContain("`queue` shows");
  });

  it("explains option-start nesting on the inner keyword of a nested set", async () => {
    const text = "queue | queue | In A. | In B. end | Out. end";
    const inner = await hoverAt(text, at(text, "queue", 1));
    expect(inner?.marked).toBe("queue");
    expect(inner?.value).toContain("starts an option of the `queue` around it");
    const outer = await hoverAt(text, 0);
    expect(outer?.value).not.toContain("starts an option of");

    const multiLine = "cycle\n| shuffle | a | b end\n| two\nend";
    const nested = await hoverAt(multiLine, at(multiLine, "shuffle"));
    expect(nested?.value).toContain("starts an option of the `cycle` around it");
  });

  it("explains the backslash on an escaped keyword at an option's start", async () => {
    const text = "cycle | \\queue | shuffle end";
    for (const index of [at(text, "\\"), at(text, "queue"), at(text, "queue") + 4]) {
      const hover = await hoverAt(text, index);
      expect(hover?.marked, String(index)).toBe("\\queue");
      expect(hover?.value).toContain("keeps it a word");
    }
    const multiLine = "queue\n| \\cycle | x\nend";
    expect((await hoverAt(multiLine, at(multiLine, "cycle")))?.value).toContain("keeps it a word");
  });

  it("gives no keyword help to a keyword-like word that opens no set", async () => {
    const cases: [string, number][] = [
      ["I queue at the shop.", 3],
      ["cycle | \\queue | shuffle end", 18],
      ["cycle | \\queue | shuffle end", 14],
      ["ALICE: queue | Hi. | Hello. end", 8],
      ["A \\queue of people.", 4],
      ["queue | a \\cycle | b end", 12],
    ];
    for (const [text, index] of cases) {
      expect(await hoverAt(text, index), `${text} @${index}`).toBeNull();
    }
  });
});

describe("alternator keyword completion at an option's start", () => {
  it("offers the keywords matching what is typed at an option's start", () => {
    for (const source of ["queue | q@1 | In B. end", "queue | q@1", "cycle\n| q@1\nend", "plural(n) | one = q@1 | other = b end"]) {
      const { labels, items } = complete(source);
      expect(labels, source).toContain("queue");
      expect(labels, source).not.toContain("cycle");
      const documentation = items.find((item) => item.label === "queue")?.documentation as { value: string };
      expect(documentation.value).toContain("At the start of an option");
    }
    expect(complete("cycle | @1 | b end").labels).toEqual(
      expect.arrayContaining(["queue", "cycle", "chain", "shuffle", "match", "plural"]),
    );
  });

  it("offers no keyword after an option's first word", () => {
    expect(complete("queue | In q@1 | b end").labels).not.toContain("queue");
  });
});
