// @vitest-environment node
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { beforeAll, describe, expect, it } from "vitest";
import { type CompletionItem } from "vscode-languageserver";
import { getHover } from "../../utils/providers/getHover";
import { complete } from "./completionHarness";

const MAIN = "file:///proj/main.sd";

const DEFS = `define raffles as character with
  name = "RAFFLES"
end

define bunny as character with
  name = "BUNNY"
end
`;

const SCENE = `
scene start
  RAFFLES [<]: Well--
  BUNNY [shout]: Busy!
end
`;

const compile = (text: string) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: MAIN, name: "main", type: "script", ext: "sd", text, languageId: "sparkdown", version: 1 }] as never,
  });
  return compiler.compile({ textDocument: { uri: MAIN } }).program!;
};

let program: ReturnType<typeof compile>;

beforeAll(() => {
  program = compile(`${DEFS}${SCENE}`);
}, 60_000);

const styled = (body: string) => `${DEFS}
style text {
${body}
}
${SCENE}`;

const completeIn = (body: string, trigger?: string) => complete(styled(body), { program, trigger });

const accepted = (body: string, item: CompletionItem) => {
  const source = styled(body);
  const offset = source.indexOf("@1");
  const text = source.replace("@1", "");
  const edit = item.textEdit as { range: { start: { line: number; character: number } }; newText: string };
  const lines = text.split("\n");
  const at = (p: { line: number; character: number }) =>
    lines.slice(0, p.line).reduce((n, l) => n + l.length + 1, 0) + p.character;
  return text.slice(0, at(edit.range.start)) + edit.newText.replace(/\$\d/g, "") + text.slice(offset);
};

describe("completing attribute selector blocks in a style (#2805)", () => {
  it.each(["  #@1", "  #var@1", "  @hovered {\n    #@1\n  }"])("offers the selectable props after # in %j", (body) => {
    const { labels } = completeIn(body, "#");
    expect(labels).toEqual(expect.arrayContaining(["#variant", "#speaker", "#tooltip"]));
  });

  it("writes the prop's selector block at the #", () => {
    const body = "  #var@1";
    const item = completeIn(body, "#").items.find((i) => i.label === "#variant")!;
    expect(item.documentation).toMatchObject({ value: expect.stringContaining("`#variant=name`") });
    expect(accepted(body, item)).toBe(styled("  #variant= {  }").replace("@1", ""));
  });

  it("writes a boolean prop's block with no value", () => {
    const body = "  #dis@1";
    const item = completeIn(body, "#").items.find((i) => i.label === "#disabled")!;
    expect(accepted(body, item)).toBe(styled("  #disabled {  }"));
  });

  it.each(["  [@1", "  [data-@1"])("offers the attributes the props write after [ in %j", (body) => {
    const { labels } = completeIn(body, "[");
    expect(labels).toEqual(expect.arrayContaining(["[data-variant]", "[data-speaker]", "[data-tooltip]", "[aria-busy]"]));
  });

  it("writes the attribute's selector block at the [", () => {
    const body = "  [@1";
    const item = completeIn(body, "[").items.find((i) => i.label === "[data-speaker]")!;
    expect(accepted(body, item)).toBe(styled("  [data-speaker=] {  }"));
  });

  it("writes over the ] the editor closed the [ with", () => {
    const body = "  [data-sp@1]";
    const item = completeIn(body, "[").items.find((i) => i.label === "[data-speaker]")!;
    const source = styled(body);
    const text = source.replace("@1", "");
    const edit = item.textEdit as { range: { start: { line: number; character: number }; end: { line: number; character: number } }; newText: string };
    const lines = text.split("\n");
    const at = (p: { line: number; character: number }) =>
      lines.slice(0, p.line).reduce((n, l) => n + l.length + 1, 0) + p.character;
    expect(text.slice(0, at(edit.range.start)) + edit.newText.replace(/\$\d/g, "") + text.slice(at(edit.range.end))).toBe(
      styled("  [data-speaker=] {  }"),
    );
  });

  it.each(["  #variant=@1", "  #variant=sh@1", "  [data-variant=@1", "  [data-variant=@1]"])("offers the script's variants in %j", (body) => {
    const { items, labels } = completeIn(body, "=");
    expect(labels).toEqual(expect.arrayContaining(["left", "shout"]));
    expect(labels).not.toContain("#variant");
    expect(items.find((item) => item.label === "shout")?.labelDetails?.description).toBe("variant");
  });

  it.each(["  #speaker=@1", "  [data-speaker=b@1"])("offers the characters' define names in %j", (body) => {
    const { labels } = completeIn(body, "=");
    expect(labels).toEqual(expect.arrayContaining(["bunny", "raffles"]));
  });

  it("offers no selector block in a property's value", () => {
    const { labels } = completeIn("  text-color = #@1", "#");
    expect(labels).not.toContain("#variant");
  });
});

describe("hovering an attribute selector block in a style (#2805)", () => {
  const SOURCE = styled(`  #variant=left { opacity = 1 }
  #speaker=bunny { opacity = 1 }
  #tooltip=hint { opacity = 1 }
  [data-variant=right] { opacity = 1 }
  [variant=right] { opacity = 1 }
  [type=submit] { opacity = 1 }`);

  const hoverOn = async (word: string) => {
    const documents = new SparkdownDocumentRegistry(["references"]);
    documents.set({ textDocument: { uri: MAIN, text: SOURCE, version: 1, languageId: "sparkdown" } });
    const document = documents.get(MAIN)!;
    const hover = await getHover(
      document,
      documents.tree(MAIN),
      documents.annotations(MAIN),
      program,
      undefined,
      document.positionAt(SOURCE.indexOf(word) + 2),
    );
    return hover
      ? { value: (hover.contents as { value: string }).value, marked: document.getText(hover.range) }
      : null;
  };

  it("describes #variant=left", async () => {
    const hover = await hoverOn("#variant=left");
    expect(hover?.marked).toBe("#variant=left");
    expect(hover?.value).toContain("selects the elements written with `#variant=left`");
    expect(hover?.value).toContain("labelled `left`");
  });

  it("describes #speaker=bunny", async () => {
    const hover = await hoverOn("#speaker=bunny");
    expect(hover?.marked).toBe("#speaker=bunny");
    expect(hover?.value).toContain("selects the elements written with `#speaker=bunny`");
    expect(hover?.value).toContain("character defined as `bunny`");
  });

  it("describes #tooltip=hint", async () => {
    const hover = await hoverOn("#tooltip=hint");
    expect(hover?.marked).toBe("#tooltip=hint");
    expect(hover?.value).toContain("selects the elements written with `#tooltip=hint`");
  });

  it("describes [data-variant=right] as the attribute #variant writes", async () => {
    const hover = await hoverOn("[data-variant=right]");
    expect(hover?.marked).toBe("[data-variant=right]");
    expect(hover?.value).toContain("whose `data-variant` attribute is `right`");
    expect(hover?.value).toContain("`#variant=right` writes this attribute");
  });

  it("explains that [variant=right] matches no element written with #variant", async () => {
    const hover = await hoverOn("[variant=right]");
    expect(hover?.value).toContain("whose `variant` attribute is `right`");
    expect(hover?.value).toContain("`#variant=right` writes `data-variant`");
  });

  it("describes a plain attribute selector", async () => {
    const hover = await hoverOn("[type=submit]");
    expect(hover?.marked).toBe("[type=submit]");
    expect(hover?.value).toContain("whose `type` attribute is `submit`");
  });
});
