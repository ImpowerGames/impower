import { describe, expect, test } from "vitest";
import { blinkScript, talkingPortrait } from "@impower/sparkdown/src/tests/morph/fixtures";
import { compileUI, createHarness, MAIN_URI } from "./harness/uiTestHarness";

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

const MORPHS = `define mia as character with
  name = "MIA"
end

define bob as character with
  name = "BOB"
end

${blinkScript()}
morph talk {
  blend = cut
  default = true
  keyframes {
    from {
      mouth {
        state = closed
      }
    }
    50% {
      mouth {
        state = open
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

const DIRECTIVE = "[[show portrait mia:mouth.teeth]]";

const story = (body: string) => `${MORPHS}

scene start
${body}
end
`;

const warned = (source: string) => {
  const { program } = compileUI(source, { assets: [ART] });
  const lines = source.split("\n");
  return (program.diagnostics?.[MAIN_URI] ?? []).some((diagnostic) => {
    const message = typeof diagnostic.message === "string" ? diagnostic.message : diagnostic.message.value;
    return message.includes("plays on this look") && lines[diagnostic.range.start.line]!.includes(DIRECTIVE);
  });
};

const talks = async (source: string) => {
  const harness = createHarness(source, 0, { assets: [ART] });
  await harness.ready;
  await harness.preview(source.split("\n").findIndex((line) => line.includes(DIRECTIVE)));
  const content = harness.messages
    .flatMap((message) => (message?.method === "ui/batch" ? message.params.messages : [message]))
    .filter((message) => message?.method === "ui/write-image" && message.params.target === "portrait" && message.params.instructions.length)
    .map((message) => message.params.instructions[0].content)
    .at(-1);
  return { written: content !== undefined, talk: (content?.morph?.plays ?? []).some((play: any) => play.owner === "mia" && play.morph === "talk"), plays: (content?.morph?.plays ?? []).map((play: any) => `${play.owner}:${play.morph}`) };
};

describe("the editor's warning agrees with the game's image write (I-2390)", () => {
  test.each([
    ["a divert between a directive line and Mia's line", story(`  ${DIRECTIVE}\n  -> next\nend\n\nscene next\n  MIA:\n    Hello there.`), true, true],
    ["a divert between a directive line and narration", story(`  ${DIRECTIVE}\n  -> next\nend\n\nscene next\n  Mia waits.`), false, false],
    ["a conditional with no else whose branch is narration", story(`  ${DIRECTIVE}\n  if true then\n    Mia waits.\n  end`), false, false],
    ["a conditional whose untaken branch is Mia's line", story(`  ${DIRECTIVE}\n  if false then\n    MIA:\n      Hello there.\n  else\n    Mia waits.\n  end`), false, false],
    ["a choice after a directive line", story(`  ${DIRECTIVE}\n  choose\n    + (a) Stay\n      MIA:\n        Hello there.\n    + (b) Leave\n      Mia leaves.`), false, false],
    ["an uncued line continuing Mia's line", story(`  MIA: Hello ..\n  ${DIRECTIVE} there.`), false, false],
    ["an uncued line led by glue continuing Mia's line", story(`  MIA: Hello\n  ..${DIRECTIVE} there.`), false, false],
    ["a follower line holding only tags before Mia's line", story(`  ${DIRECTIVE}\n  # mood\n  MIA:\n    Hello there.`), true, true],
    ["a directive-only beat with a pause before Mia's line", story(`  ${DIRECTIVE} >\n  MIA:\n    Hello there.`), false, false],
    ["a directive-only beat with a pause before narration", story(`  ${DIRECTIVE} >\n  Mia waits.`), false, false],
  ])("%s", async (_, source, editorWarns, gamePlays) => {
    const editor = warned(source);
    const shown = await talks(source);
    expect(shown.written).toBe(true);
    expect({ editor, game: shown.talk }).toEqual({ editor: editorWarns, game: gamePlays });
    expect(!shown.talk || editor).toBe(true);
  });

  test.each([
    ["an assignment between a directive line and Mia's line", story(`  local n = 0\n  ${DIRECTIVE}\n  n = 1\n  MIA:\n    Hello there.`)],
    ["a do block holding Mia's line after a directive line", story(`  ${DIRECTIVE}\n  do\n    MIA:\n      Hello there.\n  end`)],
    ["a for loop holding Mia's line after a directive line", story(`  ${DIRECTIVE}\n  for i = 1, 1 do\n    MIA:\n      Hello there.\n  end`)],
    ["a directive line ending a do block before Mia's line", story(`  do\n    ${DIRECTIVE}\n  end\n  MIA:\n    Hello there.`)],
    ["an empty interpolation between a directive line and Mia's line", story(`  ${DIRECTIVE}\n  {""}\n  MIA:\n    Hello there.`)],
    ["a conditional with no else whose branch is Mia's line", story(`  ${DIRECTIVE}\n  if true then\n    MIA:\n      Hello there.\n  end`)],
    ["a conditional whose taken else is Mia's line", story(`  ${DIRECTIVE}\n  if false then\n    Mia waits.\n  else\n    MIA:\n      Hello there.\n  end`)],
    ["an alternator whose first arm is Mia's line", story(`  ${DIRECTIVE}\n  cycle\n    |\n      MIA:\n        Hello there.\n    |\n      Mia waits.\n  end`)],
    ["a while loop holding Mia's line after a directive line", story(`  ${DIRECTIVE}\n  while true do\n    MIA:\n      Hello there.\n    break\n  end`)],
    ["a repeat loop holding Mia's line after a directive line", story(`  ${DIRECTIVE}\n  repeat\n    MIA:\n      Hello there.\n  until true`)],
    ["a directive line ending an if branch before Mia's line", story(`  if true then\n    ${DIRECTIVE}\n  end\n  MIA:\n    Hello there.`)],
    ["a directive line ending an alternator arm before Mia's line", story(`  cycle\n    |\n      ${DIRECTIVE}\n    |\n      Mia waits.\n  end\n  MIA:\n    Hello there.`)],
    ["a branch declaration between a directive line and Mia's line", story(`  ${DIRECTIVE}\n  branch unused\n    Mia waits.\n  end\n  MIA:\n    Hello there.`)],
  ])("known difference: %s leaves the editor silent where the game plays the speech morph", async (_, source) => {
    const editor = warned(source);
    const shown = await talks(source);
    expect({ editor, written: shown.written, game: shown.talk }).toEqual({ editor: false, written: true, game: true });
  });

  test.each([
    ["an inline cue holding only the directive, before a conditional into narration", story(`  MIA: ${DIRECTIVE}\n  if true then\n    Mia waits.\n  end`)],
    ["a loading directive between a directive line and Mia's line", story(`  ${DIRECTIVE}\n  [[load gallery]]\n  MIA:\n    Hello there.\nend\n\nscene gallery\n  Pictures.`)],
    [
      "a cutscene directive between a directive line and Mia's line",
      story(`  ${DIRECTIVE}\n  [[play intro]]\n  MIA:\n    Hello there.`).replace(
        "scene start",
        'define intro as video with\n  src = "https://example.invalid/intro.webm"\nend\n\nscene start',
      ),
    ],
  ])("known difference: %s makes the editor warn where the game plays no speech morph", async (_, source) => {
    const editor = warned(source);
    const shown = await talks(source);
    expect({ editor, written: shown.written, game: shown.talk }).toEqual({ editor: true, written: true, game: false });
  });

  test("known difference: a divert into a scene of another script is not followed, so the editor stays silent where the game plays the speech morph", async () => {
    const source = story(`  ${DIRECTIVE}\n  -> elsewhere`);
    const scripts = { "inmemory:///other.sd": "scene elsewhere\n  MIA:\n    Hello there.\nend\n" };
    const { program } = compileUI(source, { assets: [ART], scripts });
    const lines = source.split("\n");
    const editor = (program.diagnostics?.[MAIN_URI] ?? []).some((diagnostic) => {
      const message = typeof diagnostic.message === "string" ? diagnostic.message : diagnostic.message.value;
      return message.includes("plays on this look") && lines[diagnostic.range.start.line]!.includes(DIRECTIVE);
    });
    const harness = createHarness(source, 0, { assets: [ART], scripts });
    await harness.ready;
    await harness.preview(source.split("\n").findIndex((line) => line.includes(DIRECTIVE)));
    const content = harness.messages
      .flatMap((message) => (message?.method === "ui/batch" ? message.params.messages : [message]))
      .filter((message) => message?.method === "ui/write-image" && message.params.target === "portrait" && message.params.instructions.length)
      .map((message) => message.params.instructions[0].content)
      .at(-1);
    const game = (content?.morph?.plays ?? []).some((play: any) => play.owner === "mia" && play.morph === "talk");
    expect({ editor, written: content !== undefined, game }).toEqual({ editor: false, written: true, game: true });
  });
});
