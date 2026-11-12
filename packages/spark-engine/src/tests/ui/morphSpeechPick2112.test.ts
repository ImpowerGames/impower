import { describe, expect, test } from "vitest";
import { blinkScript, talkingPortrait } from "@impower/sparkdown/src/tests/morph/fixtures";
import { buildDefinesContext } from "../../game/core/utils/buildContextFromStory";
import { compileUI, createHarness } from "./harness/uiTestHarness";

const ART = {
  uri: "inmemory:///mia.svg",
  type: "image",
  name: "mia",
  ext: "svg",
  data: talkingPortrait().replace(
    "</svg>",
    `<g data-name="mouth.teeth">\n<path data-name="lip" d="M140 40 L160 40 L160 44 L140 44 Z" fill="#a33"/>\n</g>\n</svg>`,
  ),
} as any;

const speech = (name: string, peak: string, extra = "", head = `morph ${name} {`) => `${head}
  blend = cut
${extra}  keyframes {
    from {
      mouth {
        state = closed
      }
    }
    50% {
      mouth {
        state = ${peak}
      }
    }
    to {
      mouth {
        state = closed
      }
    }
  }
  timing {
    trigger = speech
    duration = 0.16
  }
}
`;

const TALK = speech("talk", "open", "  default = true\n");
const GRITTED = speech("talk_gritted", "teeth", "", "morph talk_gritted as talk {");
const MORPHS = `define mia as character with
  name = "MIA"
end

${blinkScript()}
${TALK}
${GRITTED}`;

const scene = (morphs: string, ...directives: string[]) => `${morphs}


scene start
${directives.map((directive, i) => `  MIA:\n    [[show portrait ${directive}]]\n    Line ${i + 1}.`).join("\n\n")}
end
`;

async function writes(source: string, line: number) {
  const harness = createHarness(source, 0, { assets: [ART] });
  await harness.ready;
  await harness.preview(source.split("\n").findIndex((text) => text.includes(`Line ${line}.`)));
  return harness.messages
    .flatMap((message) => (message?.method === "ui/batch" ? message.params.messages : [message]))
    .filter((message) => message?.method === "ui/write-image" && message.params.target === "portrait" && message.params.instructions.length)
    .map((message) => message.params.instructions[0].content);
}

const written = async (source: string, line = 1) => (await writes(source, line)).at(-1);

const drawn = (background: string) => decodeURIComponent(background);
const played = (content: any) => (content.morph?.plays ?? []).map((play: any) => play.morph);

describe("picking a speech morph per directive (I-2112)", () => {
  test("`[[x]]` carries the default speech morph and shows its rest", async () => {
    const content = await written(scene(MORPHS, "mia"));
    expect(played(content)).toEqual(["blink", "talk"]);
    expect(drawn(content.background)).toContain("data-name='mouth.closed'");
    expect(drawn(content.background)).not.toContain("mouth.open:default");
  });

  test("`[[x morph talk_gritted]]` carries the named speech morph", async () => {
    const content = await written(scene(MORPHS, "mia morph talk_gritted"));
    expect(played(content)).toEqual(["blink", "talk_gritted"]);
    expect(drawn(content.background)).toContain("data-name='mouth.closed'");
  });

  test("`[[x morph none]]` carries no speech morph, and the directive's own choice shows", async () => {
    const content = await written(scene(MORPHS, "mia:mouth.teeth morph none"));
    expect(played(content)).toEqual(["blink"]);
    expect(drawn(content.background)).toContain("data-name='mouth.teeth'");
    expect(drawn(content.background)).not.toContain("data-name='mouth.closed'");
  });

  test("a lone speech morph plays without a mark", async () => {
    const content = await written(scene(speech("talk_gritted", "teeth"), "mia"));
    expect(played(content)).toEqual(["talk_gritted"]);
  });

  test("several speech morphs on one group with no default play nothing", async () => {
    const content = await written(scene(`${speech("talk", "open")}\n${speech("talk_gritted", "teeth")}`, "mia"));
    expect(content.morph).toBeUndefined();
  });

  test("a pick does not carry to the next directive", async () => {
    const source = scene(MORPHS, "mia morph talk_gritted", "mia");
    const [first] = await writes(source, 1);
    expect(played(first)).toEqual(["blink", "talk_gritted"]);
    expect(played(await written(source, 2))).toEqual(["blink", "talk"]);
  });

  test("a different pick on the same look prepares its own set of morphs", async () => {
    const plain = await written(scene(MORPHS, "mia"));
    const gritted = await written(scene(MORPHS, "mia morph talk_gritted"));
    const key = (content: any, morph: string) => content.morph.plays.find((play: any) => play.morph === morph).ref.key;
    expect(key(plain, "talk")).not.toBe(key(gritted, "talk_gritted"));
  });
});

describe("`default` is not inherited through `as` in any channel (I-2112)", () => {
  test.each(["talk", "talk_gritted"])("morph.%s: the runtime struct and the editor's agree on the mark", async (name) => {
    const source = scene(MORPHS, "mia");
    const { program } = compileUI(source);
    const harness = createHarness(source, 0, { assets: [ART] });
    await harness.ready;
    const runtime = buildDefinesContext((harness.game as any).story)["morph"]?.[name] as any;
    const lsp = (program.context as any)?.["morph"]?.[name];
    expect(lsp).toBeDefined();
    expect(runtime).toBeDefined();
    expect(runtime.default).toBe(lsp.default);
    expect(runtime.default).toBe(name === "talk" ? true : undefined);
  });
});
