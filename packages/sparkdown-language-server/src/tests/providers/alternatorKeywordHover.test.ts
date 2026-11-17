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

  it("explains option-start nesting on a conditional set whose value is a bare name", async () => {
    for (const text of ["cycle | match mood | happy = A. | other = B. end | C. end", "cycle | plural coins | one = A. | other = B. end | C. end"]) {
      const keyword = text.split(" ")[2]!;
      const inner = await hoverAt(text, at(text, keyword) + 1);
      expect(inner?.marked, text).toBe(keyword);
      expect(inner?.value, text).toContain("starts an option of the `cycle` around it");
      expect(inner?.value, text).toContain("a value that is a name");
      expect(inner?.value, text).toContain("or a number may go without brackets");
      expect(inner?.value, text).toContain("Any other value, such as a string, a call or a sum, goes in brackets");
    }
  });

  it("explains a multi-line set nested in an option without calling it one-line", async () => {
    const text = "scene start\n  cycle\n  | queue\n    | A.\n    | B.\n    end\n  | Out.\n  end\nend";
    const inner = await hoverAt(text, at(text, "queue"));
    expect(inner?.value).toContain("starts an option of the `cycle` around it, so it opens a set nested in that option");
  });

  it("treats content written on the line below an option's bar as the option's start", async () => {
    const escaped = "scene start\n  cycle\n  |\n    \\queue\n  | Out.\n  end\nend";
    for (const index of [at(escaped, "\\"), at(escaped, "queue")]) {
      expect((await hoverAt(escaped, index))?.value, String(index)).toContain("keeps it a word");
    }
    const nested = "scene start\n  cycle\n  |\n    queue | A. | B. end\n  | Out.\n  end\nend";
    expect((await hoverAt(nested, at(nested, "queue")))?.value).toContain("starts an option of the `cycle` around it");
  });

  it("reads an option's start across a blank line, CRLF line ends and tabs", async () => {
    const layouts = [
      "scene start\n  cycle\n  |\n\n    \\queue\n  | Out.\n  end\nend",
      "scene start\r\n  cycle\r\n  |\r\n    \\queue\r\n  | Out.\r\n  end\r\nend",
      "scene start\r\n  cycle\r\n  |\r\n\r\n    \\queue\r\n  | Out.\r\n  end\r\nend",
      "cycle |\t\\queue\t| Out. end",
      "scene start\n\tcycle\n\t|\n\t\t\\queue\n\t| Out.\n\tend\nend",
    ];
    for (const text of layouts) {
      const hover = await hoverAt(text, at(text.replace(/\r\n/g, "\n"), "queue"));
      expect(hover?.value, JSON.stringify(text)).toContain("keeps it a word");
      expect(hover?.marked).toBe("\\queue");
    }
    const crlfNested = "scene start\r\n  cycle\r\n  |\r\n    queue | A. | B. end\r\n  | Out.\r\n  end\r\nend";
    const inner = await hoverAt(crlfNested, at(crlfNested.replace(/\r\n/g, "\n"), "queue"));
    expect(inner?.marked).toBe("queue");
    expect(inner?.value).toContain("starts an option of the `cycle` around it");
  });

  it("reads past a comment before an option's content in a multi-line set, as the parser does", async () => {
    const nestedAfterComment = [
      "scene start\n  cycle\n  | // note\n    queue | A. | B. end\n  | Out.\n  end\nend",
      "scene start\n  cycle\n  | /* c */ queue | A. | B. end\n  | Out.\n  end\nend",
      "scene start\n  cycle\n  |\n    // note\n    queue | A. | B. end\n  | Out.\n  end\nend",
    ];
    for (const text of nestedAfterComment) {
      expect((await hoverAt(text, at(text, "queue")))?.value, JSON.stringify(text)).toContain(
        "starts an option of the `cycle` around it",
      );
    }
    const escapedAfterComment = "scene start\n  cycle\n  | // note\n    \\queue\n  | Out.\n  end\nend";
    expect((await hoverAt(escapedAfterComment, at(escapedAfterComment, "queue")))?.value).toContain("keeps it a word");
    expect(await hoverAt("cycle | /* c */ queue | A. | B. end | Out. end", 17)).toBeNull();
    expect(await hoverAt("cycle | /* c */ \\queue | A. end", 18)).toBeNull();
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

  it("offers the keywords on the line below an option's bar", () => {
    expect(complete("scene start\n  cycle\n  |\n    q@1\n  | Out.\n  end\nend").labels).toContain("queue");
    expect(complete("scene start\n  cycle\n  |\n\n    q@1\n  | Out.\n  end\nend").labels).toContain("queue");
    expect(complete("scene start\n  cycle\n  |\n    // note\n    q@1\n  | Out.\n  end\nend").labels).toContain("queue");
  });

  it("offers no keyword inside a comment at an option's start", () => {
    expect(complete("scene start\n  cycle\n  | // q@1\n  | Out.\n  end\nend").labels).not.toContain("queue");
    expect(complete("scene start\n  cycle\n  | /* q@1 */\n  | Out.\n  end\nend").labels).not.toContain("queue");
  });

  it("offers no keyword after an option's first word", () => {
    expect(complete("queue | In q@1 | b end").labels).not.toContain("queue");
  });
});
