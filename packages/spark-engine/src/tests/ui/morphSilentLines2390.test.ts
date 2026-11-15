import { describe, expect, test } from "vitest";
import { blinkScript, talkingPortrait } from "@impower/sparkdown/src/tests/morph/fixtures";
import { createHarness } from "./harness/uiTestHarness";

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

const MORPHS = `define mia as character with
  name = "MIA"
  aliases = { "STRANGER" }
end

define bob as character with
  name = "BOB"
end

${blinkScript()}
${speech("talk", "open", "  default = true\n")}
${speech("talk_gritted", "teeth", "", "morph talk_gritted as talk {")}`;

const scene = (body: string) => `${MORPHS}


scene start
${body}
end
`;

async function written(source: string) {
  const harness = createHarness(source, 0, { assets: [ART] });
  await harness.ready;
  await harness.preview(source.split("\n").findIndex((text) => text.includes("[[show portrait")));
  return harness.messages
    .flatMap((message) => (message?.method === "ui/batch" ? message.params.messages : [message]))
    .filter((message) => message?.method === "ui/write-image" && message.params.target === "portrait" && message.params.instructions.length)
    .map((message) => message.params.instructions[0].content)
    .at(-1);
}

const drawn = (content: any) => decodeURIComponent(content.background);
const played = (content: any) => (content.morph?.plays ?? []).map((play: any) => play.morph);

describe("a speech morph acts only on its character's lines (I-2390)", () => {
  test.each([
    ["narration", "  [[show portrait mia:mouth.teeth]]\n  Here is Mia."],
    ["narration with a pick", "  [[show portrait mia:mouth.teeth morph talk_gritted]]\n  Here is Mia."],
    ["another character's line", "  BOB:\n    [[show portrait mia:mouth.teeth]]\n    Here is Mia."],
    ["another character's inline line", "  BOB: [[show portrait mia:mouth.teeth]] Here is Mia."],
  ])("on %s the portrait carries no speech morph and shows the directive's mouth", async (_, body) => {
    const content = await written(scene(body));
    expect(played(content)).toEqual(["blink"]);
    expect(drawn(content)).toContain("data-name='mouth.teeth'");
    expect(drawn(content)).not.toContain("data-name='mouth.closed'");
  });

  test("on narration a mouth the directive did not set shows the art's default, not the morph's rest", async () => {
    const content = await written(scene("  [[show portrait mia]]\n  Here is Mia."));
    expect(played(content)).toEqual(["blink"]);
    expect(drawn(content)).toContain("mouth.open:default");
    expect(drawn(content)).not.toContain("data-name='mouth.closed'");
  });

  test.each([
    ["its define name", "  mia:\n    [[show portrait mia:mouth.teeth]]\n    Here is Mia."],
    ["its name", "  MIA:\n    [[show portrait mia:mouth.teeth]]\n    Here is Mia."],
    ["an alias", "  STRANGER:\n    [[show portrait mia:mouth.teeth]]\n    Here is Mia."],
    ["the as form", "  WHO as mia:\n    [[show portrait mia:mouth.teeth]]\n    Here is Mia."],
    ["an inline line", "  MIA: [[show portrait mia:mouth.teeth]] Here is Mia."],
  ])("under a cue naming the character by %s the speech morph plays and rests the mouth", async (_, body) => {
    const content = await written(scene(body));
    expect(played(content)).toEqual(["blink", "talk"]);
    expect(drawn(content)).toContain("data-name='mouth.closed'");
  });

  test("the portrait's saved state keeps the look its line gave it, for a restore on a later beat", async () => {
    const source = scene("  [[show portrait mia morph talk_gritted]]\n  Here is Mia.");
    const harness = createHarness(source, 0, { assets: [ART] });
    await harness.ready;
    await harness.preview(source.split("\n").findIndex((text) => text.includes("[[show portrait")));
    const saved = (harness.game as any).module.ui._state.image?.portrait;
    expect(saved?.map((event: any) => event.morph)).toEqual(["none"]);
  });

  test("a pick on the character's own line still chooses the speech morph", async () => {
    const content = await written(scene("  MIA:\n    [[show portrait mia morph talk_gritted]]\n    Here is Mia."));
    expect(played(content)).toEqual(["blink", "talk_gritted"]);
  });
});
