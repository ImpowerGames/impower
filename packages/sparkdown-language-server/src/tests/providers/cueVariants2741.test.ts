// @vitest-environment node
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { beforeAll, describe, expect, it } from "vitest";
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

const compile = (text: string) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: MAIN, name: "main", type: "script", ext: "sd", text, languageId: "sparkdown", version: 1 }] as never,
  });
  return compiler.compile({ textDocument: { uri: MAIN } }).program!;
};

beforeAll(() => {
  compile(DEFS);
}, 60_000);

const warnings = (text: string, code: string) =>
  (compile(text).diagnostics?.[MAIN] ?? [])
    .filter((d: any) => d.code === code)
    .map((d: any) => ({
      message: typeof d.message === "string" ? d.message : d.message.value,
      text: text.split("\n")[d.range.start.line]!.slice(d.range.start.character, d.range.end.character),
    }));

const scene = (cue: string) => `${DEFS}
scene start
  ${cue}: Hello.
end
`;

describe("a word in a cue's brackets is the line's variant (#2741)", () => {
  it("warns on a variant that is not one word of letters, digits and _", () => {
    expect(warnings(scene("BUNNY [two words]"), "cue-variant")).toEqual([
      { message: "A variant uses letters, digits and `_`.", text: "two words" },
    ]);
    expect(warnings(scene("BUNNY [a-b]"), "cue-variant")).toEqual([
      { message: "A variant uses letters, digits and `_`.", text: "a-b" },
    ]);
  });

  it.each(["[]", "[   ]"])("warns on the empty brackets %s", (brackets) => {
    expect(warnings(scene(`BUNNY ${brackets}`), "cue-variant")).toEqual([
      { message: "A variant uses letters, digits and `_`.", text: brackets },
    ]);
  });

  it.each(["BUNNY [left]", "BUNNY [<]", "BUNNY [>]", "BUNNY [ shout ]", "BUNNY [shout_2]", "BUNNY [constructor]", "BUNNY", "BUNNY (O.S.) [right]"])(
    "does not warn on %s",
    (cue) => {
      expect(warnings(scene(cue), "cue-variant")).toEqual([]);
    },
  );
});

describe("@variant and @speaker are states of the style's own selector (#2741)", () => {
  const styled = (selector: string) => `${DEFS}
style frame {
  ${selector} {
    opacity = 1
  }
}

scene start
  BUNNY: Hello.
end
`;

  it.each(["@variant(shout)", "@speaker(bunny)", "@variant(left) @hovered", "@speaker(bunny) >> name"])(
    "accepts %s",
    (selector) => {
      const diagnostics = compile(styled(selector)).diagnostics?.[MAIN] ?? [];
      expect(diagnostics.map((d: any) => (typeof d.message === "string" ? d.message : d.message.value))).toEqual([]);
    },
  );

  it.each([
    ["icon > @variant(shout)", "@variant(shout)", "in a compound after a combinator", "the newest line has another variant"],
    ["@not(@speaker(bunny))", "@speaker(bunny)", "inside `@not(…)`", "someone else speaks the newest line"],
  ])("warns on %s with the showing-position rule", (selector, condition, where, otherwise) => {
    const state = condition.slice(1, condition.indexOf("("));
    const example = state === "variant" ? "shout" : "bunny";
    expect(warnings(styled(selector), "showing-position")).toEqual([
      {
        message: `\`@${state}\` cannot be written ${where}, so this block never applies.\n> Write it as a state of the style's own selector, as in \`@${state}(${example}) @hovered\`; the style's own properties are its look while ${otherwise}`,
        text: condition,
      },
    ]);
  });
});

describe("editor help for variants and speakers (#2741)", () => {
  const source = `${DEFS}
style frame {
  @1 {
    opacity = 1
  }
}

scene start
  RAFFLES [<]: Well--
  BUNNY [shout]: Busy!
  BUNNY [send]: Hi.
end
`;

  it("completes the variants the script uses inside @variant(", () => {
    const text = source.replace("@1", "@variant(@1)");
    const program = compile(text.replace("@1", "shout"));
    const { items, labels } = complete(text, { program });
    expect(labels).toEqual(expect.arrayContaining(["left", "send", "shout"]));
    expect(labels).not.toContain("<");
    expect(items.find((item) => item.label === "shout")?.labelDetails?.description).toBe("variant");
  });

  it("completes the characters' define names inside @speaker(", () => {
    const text = source.replace("@1", "@speaker(@1)");
    const program = compile(text.replace("@1", "bunny"));
    const { items, labels } = complete(text, { program });
    expect(labels).toEqual(expect.arrayContaining(["bunny", "raffles"]));
    expect(items.find((item) => item.label === "bunny")?.labelDetails?.description).toBe("character");
  });

  const hoverAt = async (text: string, line: number, character: number) => {
    const documents = new SparkdownDocumentRegistry(["references"]);
    documents.set({ textDocument: { uri: MAIN, text, version: 1, languageId: "sparkdown" } });
    const hover = await getHover(
      documents.get(MAIN),
      documents.tree(MAIN),
      documents.annotations(MAIN),
      compile(text),
      undefined,
      { line, character },
    );
    return (hover?.contents as { value: string } | undefined)?.value;
  };

  it("describes both conditions on hover", async () => {
    expect(await hoverAt(source.replace("@1", "@variant(shout)"), 9, 5)).toContain(
      "`@variant(name)` applies while the newest line showing is labelled `name`",
    );
    expect(await hoverAt(source.replace("@1", "@speaker(bunny)"), 9, 5)).toContain(
      "`@speaker(name)` applies while the newest line showing is spoken by the character defined as `name`",
    );
  });

  it("describes no line condition on a state named after an Object member", async () => {
    const value = await hoverAt(source.replace("@1", "@constructor"), 9, 5);
    expect(value === undefined || typeof value === "string").toBe(true);
    expect(String(value)).not.toContain("[native code]");
  });

  it("describes a cue's variant on hover", async () => {
    expect(await hoverAt(source.replace("@1", "@hovered"), 16, 10)).toContain("A variant labels the line");
  });
});
