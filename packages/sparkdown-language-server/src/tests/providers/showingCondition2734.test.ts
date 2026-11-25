// @vitest-environment node
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { beforeAll, describe, expect, it } from "vitest";
import { getHover } from "../../utils/providers/getHover";
import { complete } from "./completionHarness";

const MAIN = "file:///proj/main.sd";

const LAYOUTS = `layout hud {
  frame {
    text = HUD
  }
}

layout panel {
  nameplate {
    text
  }
}
`;

const compile = (text: string) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: MAIN, name: "main", type: "script", ext: "sd", text, languageId: "sparkdown", version: 1 }] as never,
  });
  return compiler.compile({ textDocument: { uri: MAIN } }).program!;
};

beforeAll(() => {
  compile(LAYOUTS);
}, 60_000);

const styled = (name: string) => `${LAYOUTS}
style frame {
  @showing(${name}) {
    opacity = 1
  }
}
`;

const showingWarnings = (text: string) =>
  (compile(text).diagnostics?.[MAIN] ?? [])
    .filter((d: any) => d.code === "showing-name")
    .map((d: any) => ({
      message: typeof d.message === "string" ? d.message : d.message.value,
      line: d.range.start.line,
      from: d.range.start.character,
      to: d.range.end.character,
    }));

describe("@showing(name) names a layout or an element (#2734)", () => {
  it("warns on a name that is no layout and no element", () => {
    expect(showingWarnings(styled("nmae"))).toEqual([
      { message: "No layout or element is named `nmae`.", line: 13, from: 11, to: 15 },
    ]);
  });

  it.each(["hud", "panel", "frame", "nameplate", "text", "action", "dialogue", "textbox"])(
    "does not warn on %s, a layout's or an element's name",
    (name) => {
      expect(showingWarnings(styled(name))).toEqual([]);
    },
  );
});

describe("@showing(name) takes a name with @ alternates (#2734)", () => {
  it("does not warn on a layout named with an alternate", () => {
    expect(
      showingWarnings(`layout menu@pause {
  badge@night {
    text "Status"
  }
}

style frame {
  @showing(menu@pause) {
    opacity = 1
  }
  @showing(badge@night) {
    opacity = 1
  }
}
`),
    ).toEqual([]);
  });
});

describe("editor help for @showing (#2734)", () => {
  it("completes the project's layout and element names inside the parentheses", () => {
    const source = `${LAYOUTS}
style frame {
  @showing(@1) {
    opacity = 1
  }
}
`;
    const program = compile(source.replace("@1", "hud"));
    const { items, labels } = complete(source, { program });
    expect(labels).toEqual(expect.arrayContaining(["hud", "panel", "frame", "nameplate", "text", "action", "textbox"]));
    expect(items.find((item) => item.label === "hud")?.labelDetails?.description).toBe("layout");
    expect(items.find((item) => item.label === "frame")?.labelDetails?.description).toBe("element");
  });

  it("describes the condition on hover", async () => {
    const text = styled("hud");
    const documents = new SparkdownDocumentRegistry(["references"]);
    documents.set({ textDocument: { uri: MAIN, text, version: 1, languageId: "sparkdown" } });
    const hover = await getHover(
      documents.get(MAIN),
      documents.tree(MAIN),
      documents.annotations(MAIN),
      compile(text),
      undefined,
      { line: 13, character: 5 },
    );
    expect((hover?.contents as { value: string }).value).toContain(
      "`@showing(name)` applies while a layout or an element named `name` is on screen",
    );
  });
});
