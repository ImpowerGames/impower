import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, test } from "vitest";
import { getHover } from "../../utils/providers/getHover";
import { completeAt, insertedText } from "./braceCompletionHarness";

const FACE = `<svg xmlns="http://www.w3.org/2000/svg">
<g data-name="lids:eyes.open:default" id="open"/>
<g data-name="lids:eyes.closed" id="closed"/>
<g data-name="lips:mouth.closed:default" id="m-closed"/>
<g data-name="lips:mouth.open" id="m-open"/>
<g data-name="lips:mouth.teeth" id="m-teeth"/>
</svg>`;

const speech = (name: string, peak: string, extra = "") => `morph ${name} {
  blend = cut
${extra}  keyframes {
    from { mouth { state = closed } }
    50% { mouth { state = ${peak} } }
    to { mouth { state = closed } }
  }
  timing {
    trigger = speech
  }
}
`;

const MORPHS = `${speech("talk", "open", "  default = true\n")}
${speech("talk_gritted", "teeth")}
${speech("talk_smile", "open", "  when = mouth.teeth\n")}
morph blink {
  blend = cut
  keyframes {
    from { eyes { state = open } }
    50% { eyes { state = closed } }
    to { eyes { state = open } }
  }
}
`;

const story = (lines: string) => `${MORPHS}
scene start
${lines}
end
`;

function compiled(text: string) {
  const compiler = new SparkdownCompiler();
  const uri = "file:///proj/main.sd";
  compiler.configure({
    files: [
      { uri, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" },
      { uri: "file:///proj/bunny.svg", type: "image", name: "bunny", ext: "svg", data: FACE },
    ],
  } as any);
  return compiler.compile({ textDocument: { uri } }).program;
}

const itemsAt = (lines: string) => {
  const source = story(lines);
  return completeAt(source, compiled(source.replace("|", "")));
};

const labels = (lines: string) => itemsAt(lines).map((item) => String(item.label));

let version = 0;

const hoverAt = async (text: string, needle: string, within = 1) => {
  const uri = `file:///pick${++version}.sd`;
  const documents = new SparkdownDocumentRegistry(["references"]);
  documents.set({ textDocument: { uri, text, version, languageId: "sparkdown" } });
  const document = documents.get(uri)!;
  const index = text.indexOf(needle);
  expect(index, needle).toBeGreaterThanOrEqual(0);
  const hover = await getHover(document, documents.tree(uri), documents.annotations(uri), undefined, undefined, document.positionAt(index + within));
  return hover ? { value: (hover.contents as { value: string }).value, marked: document.getText(hover.range) } : null;
};

describe("completion and hover for the `morph` clause (I-2112)", () => {
  test("after `morph`, completion lists `none` and the speech morphs that play on an image in the directive, the default marked", () => {
    const items = itemsAt("  [[bunny morph |]]");
    expect(items.map((item) => String(item.label)).sort()).toEqual(["none", "talk", "talk_gritted"]);
    const talk = items.find((item) => item.label === "talk")!;
    expect(talk.labelDetails?.description).toBe("speech morph, default");
    expect(items.find((item) => item.label === "talk_gritted")!.labelDetails?.description).toBe("speech morph");
    expect(insertedText(talk)).toBe("talk");
  });

  test("the list follows the directive's look and every image in a composition", () => {
    expect(labels("  [[bunny:mouth.teeth morph |]]").sort()).toEqual(["none", "talk", "talk_gritted", "talk_smile"]);
    expect(labels("  [[bunny + bunny:mouth.teeth morph ta|]]")).toEqual(expect.arrayContaining(["talk_smile", "talk"]));
  });

  test("after `with`, a clause word, and before `morph`, it offers the clause", () => {
    expect(labels("  [[bunny with fade |]]")).toContain("morph");
    expect(labels("  [[bunny morph talk |]]")).not.toContain("morph");
  });

  test("picks are offered only where the game reads a `morph` clause", () => {
    expect(labels("  [[bunny wait x.morph |]]")).not.toContain("talk_gritted");
    expect(labels("  [[bunny with fade x.morph |]]")).not.toContain("talk_gritted");
    expect(labels("  [[bunny morph |]]")).not.toContain("talk_gritted");
    expect(labels("  [[bunny with morph |]]")).not.toContain("talk_gritted");
    expect(labels("  [[bunny wait morph |]]").sort()).toEqual(["none", "talk", "talk_gritted"]);
    expect(labels("  [[bunny morph # note |]]")).not.toContain("talk");
  });

  test("clause values are offered only where the game reads that clause", () => {
    const afterStrayImageWord = labels("  [[bunny wait garbage |]]");
    expect(labels("  [[bunny wait x.with |]]")).toEqual(afterStrayImageWord);
    expect(labels("  [[bunny wait x.ease |]]")).toEqual(afterStrayImageWord);
    expect(labels("  ((play music theme wait x.with |))")).toEqual(labels("  ((play music theme wait garbage |))"));
  });

  test("hover explains `morph` only where the game reads a `morph` clause", async () => {
    expect(await hoverAt(story("  [[bunny wait x.morph talk]]"), "x.morph", "x.m".length)).toBeNull();
  });

  test("with no speech morph there, only `none` is offered", () => {
    expect(labels("  [[nobody morph |]]")).toEqual(["none"]);
  });

  test("hover on `morph` in a directive says what the clause does", async () => {
    const hover = await hoverAt(story("  [[bunny morph talk_gritted]]"), "[[bunny morph", "[[bunny m".length);
    expect(hover).toEqual({ value: expect.stringContaining("Picks the speech morph this directive plays"), marked: "morph" });
    expect(hover!.value).toContain("`morph none` plays no speech morph");
  });
});

describe("completion and hover for `default` (I-2112)", () => {
  const program = { context: { morph: { $default: {} } } } as any;
  const TALK = (field: string) => `morph talk {
  blend = cut
${field}
  keyframes {
    from { mouth { state = closed } }
    to { mouth { state = open } }
  }
  timing { trigger = speech }
}
`;

  test("the root offers `default`, and its value offers `true` and `false`", () => {
    const root = completeAt(TALK("  |"), program);
    const field = root.find((item) => item.label === "default")!;
    expect(field).toBeDefined();
    expect(insertedText(field)).toBe("default = ");
    expect(completeAt(TALK("  default = |"), program).map((item) => String(item.label))).toEqual(["true", "false"]);
  });

  test("hover on `default` says what the mark does and that `as` does not pass it on", async () => {
    const hover = await hoverAt(TALK("  default = true"), "default =");
    expect(hover).toEqual({ value: expect.stringContaining("`true` marks the speech morph that plays"), marked: "default" });
    expect(hover!.value).toContain("a child morph does not inherit it through `as`");
  });
});
