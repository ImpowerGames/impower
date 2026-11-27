import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, it } from "vitest";
import { getHover } from "../../src/utils/providers/getHover";
import {
  STREAM_BLOCK_DESCRIPTION,
  STREAM_ELEMENT_DESCRIPTION,
  STREAM_SETTING_DOCS,
} from "../../src/utils/providers/streamElementHelp";
import { compileProject, complete } from "./completionHarness";

const URI = "file:///proj/main.sd";

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
  pause = 0.6s
}
`;

const program = compileProject(`${BLOCK}
stream phnoe {
  advance = auto
}

scene start
  [[open phone]]
  Hello.
end
`);

const hoverAt = async (text: string, needle: string, shift = 1) => {
  const documents = new SparkdownDocumentRegistry(["references"]);
  documents.set({ textDocument: { uri: URI, text, version: 1, languageId: "sparkdown" } });
  const document = documents.get(URI)!;
  const hover = await getHover(
    document,
    documents.tree(URI),
    documents.annotations(URI),
    undefined,
    undefined,
    document.positionAt(text.indexOf(needle) + shift),
  );
  return hover
    ? {
        value: (hover.contents as { value: string }).value,
        marked: document.getText(hover.range),
      }
    : null;
};

describe("editor help for the stream block (I-2743)", () => {
  it("offers the stream keyword at the top level with its settings snippet", () => {
    const item = complete(`${LAYOUT}\nstr@0\n`, { program }).items.find((i) => i.label === "stream");
    expect(item).toBeDefined();
    expect((item!.documentation as { value: string }).value).toBe(STREAM_BLOCK_DESCRIPTION);
    expect(item!.insertText).toContain("advance = ");
  });

  it("still offers the stream element inside a layout body", () => {
    const item = complete("layout log {\n  str@0\n}\n", { program }).items.find((i) => i.label === "stream");
    expect((item!.documentation as { value: string }).value).toBe(STREAM_ELEMENT_DESCRIPTION);
  });

  it("completes the two settings inside a stream block", () => {
    const labels = (source: string) => complete(source, { program }).labels;
    expect(labels(`${LAYOUT}\nstream phone {\n  ad@0\n}\n`)).toContain("advance");
    expect(labels(`${LAYOUT}\nstream phone {\n  advance = auto\n  pa@0\n}\n`)).toContain("pause");
  });

  it("describes the keyword on hover", async () => {
    expect(await hoverAt(BLOCK, "stream phone")).toEqual({
      value: STREAM_BLOCK_DESCRIPTION,
      marked: "stream",
    });
  });

  it("describes each setting on hover", async () => {
    expect(await hoverAt(BLOCK, "advance =")).toEqual({
      value: STREAM_SETTING_DOCS["advance"],
      marked: "advance",
    });
    expect(await hoverAt(BLOCK, "pause =")).toEqual({
      value: STREAM_SETTING_DOCS["pause"],
      marked: "pause",
    });
  });

  it("warns on a stream block that names no layout", () => {
    const warnings = (program.diagnostics?.[URI] ?? []).map((d) =>
      typeof d.message === "string" ? d.message : d.message.value,
    );
    expect(warnings).toContain("No layout is named `phnoe`.");
    expect(warnings).not.toContain("No layout is named `phone`.");
  });
});
