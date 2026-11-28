import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, test } from "vitest";
import { getHover } from "../../src/utils/providers/getHover";
import {
  STREAM_BLOCK_DESCRIPTION,
  STREAM_ENTRY_STATE_DOCS,
  STREAM_SETTING_DOCS,
} from "../../src/utils/providers/streamElementHelp";
import { accept, completeAt } from "./braceCompletionHarness";
import { compileProject, complete } from "./completionHarness";

const LAYOUT = `layout phone {
  thread {
    stream {
      dialogue.bubble { text }
    }
  }
}
`;

const BLOCK = `${LAYOUT}
stream phone {
  advance = auto
  clear = run
  carry = 1
}

style bubble {
  @carried { opacity = 0.6 }
  @latest { opacity = 1 }
}
`;

const program = compileProject(`${BLOCK}
scene start
  [[open phone]]
  Hello.
end
`);

let version = 0;

const hoverOn = async (text: string, needle: string) => {
  const uri = `file:///carry${++version}.sd`;
  const documents = new SparkdownDocumentRegistry(["references"]);
  documents.set({ textDocument: { uri, text, version, languageId: "sparkdown" } });
  const document = documents.get(uri)!;
  const hover = await getHover(
    document,
    documents.tree(uri),
    documents.annotations(uri),
    undefined,
    undefined,
    document.positionAt(text.indexOf(needle) + 1),
  );
  return hover
    ? { value: (hover.contents as { value: string }).value, marked: document.getText(hover.range) }
    : null;
};

const styles = { context: { style: { bubble: { $type: "style", $name: "bubble" } } } } as any;

describe("editor help for `clear`, `carry` and `@carried` (I-2745)", () => {
  test("completes the two settings inside a stream block", () => {
    const labels = (source: string) => complete(source, { program }).labels;
    expect(labels(`${LAYOUT}\nstream phone {\n  cl@0\n}\n`)).toContain("clear");
    expect(labels(`${LAYOUT}\nstream phone {\n  clear = run\n  ca@0\n}\n`)).toContain("carry");
  });

  test("describes each setting on hover, and the keyword's help names both", async () => {
    expect(await hoverOn(BLOCK, "clear =")).toEqual({
      value: STREAM_SETTING_DOCS["clear"],
      marked: "clear",
    });
    expect(await hoverOn(BLOCK, "carry =")).toEqual({
      value: STREAM_SETTING_DOCS["carry"],
      marked: "carry",
    });
    expect(STREAM_BLOCK_DESCRIPTION).toContain("- `clear`:");
    expect(STREAM_BLOCK_DESCRIPTION).toContain("- `carry`:");
  });

  test("typing @ in a style offers `@carried` and `@latest`, written with their braces", () => {
    const source = "style bubble {\n  @ca|\n}\n";
    const items = completeAt(source, styles, "@");
    expect(items.map((item) => String(item.label))).toEqual(
      expect.arrayContaining(["@carried", "@latest"]),
    );
    const carried = items.find((item) => item.label === "@carried")!;
    expect(carried.documentation).toMatchObject({ value: STREAM_ENTRY_STATE_DOCS["carried"] });
    expect(accept(source, carried).text).toBe("style bubble {\n  @carried {  }\n}\n");
  });

  test("hovering `@carried` and `@latest` explains them", async () => {
    expect(await hoverOn(BLOCK, "@carried")).toEqual({
      value: STREAM_ENTRY_STATE_DOCS["carried"],
      marked: "@carried",
    });
    expect(await hoverOn(BLOCK, "@latest")).toEqual({
      value: STREAM_ENTRY_STATE_DOCS["latest"],
      marked: "@latest",
    });
  });

  test("the compiled project has no diagnostics for the settings or the states", () => {
    const messages = Object.values(program.diagnostics ?? {})
      .flat()
      .map((d) => (typeof d.message === "string" ? d.message : d.message.value));
    expect(messages.filter((m) => /carried|latest|clear|carry/.test(m))).toEqual([]);
  });
});
