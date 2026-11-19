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

const ARTS = [ART, { ...ART, uri: "inmemory:///bob.svg", name: "bob" }, { ...ART, uri: "inmemory:///statue.svg", name: "statue" }];

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
  const harness = createHarness(source, 0, { assets: ARTS });
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
    ["a directive line above narration, after a blank line", "  [[show portrait mia:mouth.teeth]]\n\n  Here is Mia."],
    ["a directive line above another character's cue", "  [[show portrait mia:mouth.teeth]]\n  BOB:\n    Here is Mia."],
    ["a directive line above another character's cue, after a blank line", "  [[show portrait mia:mouth.teeth]]\n\n  BOB:\n    Here is Mia."],
    ["a directive line with no display line after it", "  [[show portrait mia:mouth.teeth]]"],
    ["an inline cue holding only the directive, above narration", "  MIA: [[show portrait mia:mouth.teeth]]\n  Here is Mia."],
  ])("on %s the portrait carries no speech morph and shows the directive's mouth", async (_, body) => {
    const content = await written(scene(body));
    expect(played(content)).toEqual(["blink"]);
    expect(drawn(content)).toContain("data-name='mouth.teeth'");
    expect(drawn(content)).not.toContain("data-name='mouth.closed'");
  });

  test("on narration a mouth the directive did not set shows the art's default, not the morph's rest", async () => {
    const content = await written(scene("  [[show portrait mia]]\n  Here is Mia."));
    expect(played(content)).toEqual(["blink"]);
    expect(drawn(content)).toContain("mouth.open default");
    expect(drawn(content)).not.toContain("data-name='mouth.closed'");
  });

  test.each([
    ["its define name", "  mia:\n    [[show portrait mia:mouth.teeth]]\n    Here is Mia."],
    ["its name", "  MIA:\n    [[show portrait mia:mouth.teeth]]\n    Here is Mia."],
    ["an alias", "  STRANGER:\n    [[show portrait mia:mouth.teeth]]\n    Here is Mia."],
    ["the as form", "  WHO as mia:\n    [[show portrait mia:mouth.teeth]]\n    Here is Mia."],
    ["an inline line", "  MIA: [[show portrait mia:mouth.teeth]] Here is Mia."],
    ["a directive line right above the cue", "  [[show portrait mia:mouth.teeth]]\n  MIA:\n    Here is Mia."],
    ["a directive line above the cue, after a blank line", "  [[show portrait mia:mouth.teeth]]\n\n  MIA:\n    Here is Mia."],
    ["a directive line with a comment, right above the cue", "  [[show portrait mia:mouth.teeth]] // Mia looks up\n  MIA:\n    Here is Mia."],
    ["a directive line and a variable statement above the cue", "  [[show portrait mia:mouth.teeth]]\n  local n = 1\n  MIA:\n    Here is Mia."],
    ["a block whose last line is the directive, before another cue", "  MIA:\n    Here is Mia.\n    [[show portrait mia:mouth.teeth]]\n  BOB:\n    Goodbye."],
    ["a styled directive line above the cue", "  **[[show portrait mia:mouth.teeth]]**\n  MIA:\n    Here is Mia."],
  ])("under a cue naming the character by %s the speech morph plays and rests the mouth", async (_, body) => {
    const content = await written(scene(body));
    expect(played(content)).toEqual(["blink", "talk"]);
    expect(drawn(content)).toContain("data-name='mouth.closed'");
  });

  describe("a kept portrait restores with the look its line gave it", () => {
    const restored = async (body: string, saved?: (state: any[]) => any[]) => {
      const source = scene(body);
      const harness = createHarness(source, 0, { assets: ARTS });
      await harness.ready;
      await harness.preview(source.split("\n").findIndex((text) => text.includes("[[show portrait")));
      const ui = (harness.game as any).module.ui;
      if (saved) ui._state.image.portrait = saved(ui._state.image.portrait);
      const before = harness.messages.length;
      await ui.image.restore("portrait");
      return harness.messages
        .slice(before)
        .flatMap((message) => (message?.method === "ui/batch" ? message.params.messages : [message]))
        .filter((message) => message?.method === "ui/write-image" && message.params.target === "portrait" && message.params.instructions.length)
        .map((message) => message.params.instructions[0].content)
        .at(-1);
    };

    test("shown on narration, it carries no speech morph when restored", async () => {
      const content = await restored("  [[show portrait mia:mouth.teeth morph talk_gritted]]\n  Here is Mia.");
      expect(played(content)).toEqual(["blink"]);
      expect(drawn(content)).toContain("data-name='mouth.teeth'");
    });

    test("shown on its character's line, it carries the speech morph when restored", async () => {
      const content = await restored("  MIA:\n    [[show portrait mia:mouth.teeth morph talk_gritted]]\n    Here is Mia.");
      expect(played(content)).toEqual(["blink", "talk_gritted"]);
    });

    test("a save written before the speaker was kept restores as it did then", async () => {
      const content = await restored("  [[show portrait mia:mouth.teeth]]\n  Here is Mia.", (state) =>
        state.map(({ speaker, ...event }: any) => event),
      );
      expect(played(content)).toEqual(["blink", "talk"]);
      expect(drawn(content)).toContain("data-name='mouth.closed'");
    });
  });

  test("a named layered image decides each layer by its own character", async () => {
    const source = (body: string) =>
      scene(`${body}`).replace("scene start", "define pair as layered_image with\n  assets = { image.mia, image.bob }\nend\n\nscene start");
    const plays = async (body: string) => {
      const content = await written(source(body));
      const by = (owner: string) =>
        (content.morph?.plays ?? []).filter((play: any) => play.owner === owner).map((play: any) => play.morph);
      return { mia: by("mia"), bob: by("bob") };
    };
    expect(await plays("  MIA:\n    [[show portrait pair:mouth.teeth]]\n    Here is Mia.")).toEqual({ mia: ["blink", "talk"], bob: ["blink"] });
    expect(await plays("  BOB:\n    [[show portrait pair:mouth.teeth]]\n    Here is Bob.")).toEqual({ mia: ["blink"], bob: ["blink", "talk"] });
    expect(await plays("  [[show portrait pair:mouth.teeth]]\n  Here they are.")).toEqual({ mia: ["blink"], bob: ["blink"] });
  });

  test("in a composition each portrait follows its own character, and an image that belongs to no character keeps its pick", async () => {
    const plays = async (body: string) => {
      const content = await written(scene(body));
      const by = (owner: string | undefined) =>
        (content.morph?.plays ?? []).filter((play: any) => play.owner === owner).map((play: any) => play.morph);
      return { mia: by("mia"), bob: by("bob"), statue: by(undefined) };
    };
    expect(await plays("  MIA:\n    [[show portrait mia:mouth.teeth + bob:mouth.teeth]]\n    Here is Mia.")).toEqual({
      mia: ["blink", "talk"],
      bob: ["blink"],
      statue: [],
    });
    expect(await plays("  [[show portrait statue + mia:mouth.teeth]]\n  Here is Mia.")).toEqual({
      mia: ["blink"],
      bob: [],
      statue: ["blink", "talk"],
    });
  });

  test("a pick on the character's own line still chooses the speech morph", async () => {
    const content = await written(scene("  MIA:\n    [[show portrait mia morph talk_gritted]]\n    Here is Mia."));
    expect(played(content)).toEqual(["blink", "talk_gritted"]);
  });
});
