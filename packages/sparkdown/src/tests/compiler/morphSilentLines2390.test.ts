import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

const URI = "file:///main.sd";

const FACE = `<svg xmlns="http://www.w3.org/2000/svg">
<g data-name="lids:eyes.open:default" id="open"/>
<g data-name="lids:eyes.closed" id="closed"/>
<g data-name="lips:mouth.open:default" id="m-open"/>
<g data-name="lips:mouth.closed" id="m-closed"/>
<g data-name="lips:mouth.teeth" id="m-teeth"/>
</svg>`;

const TALK = `morph talk {
  blend = cut
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
  }
}
`;

const BLINK = `morph blink {
  method = bend
  keyframes {
    from {
      eyes {
        state = open
      }
    }
    50% {
      eyes {
        state = closed
      }
    }
    to {
      eyes {
        state = open
      }
    }
  }
}
`;

const CHARACTERS = `define bunny as character with
  name = "BUNNY"
  aliases = { "STRANGER" }
end

define raffles as character with
  name = "RAFFLES"
end
`;

const story = (lines: string, head = "") => `${CHARACTERS}
${TALK}
${BLINK}
${head}
scene start
${lines}
end
`;

function warnings(text: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" },
      { uri: "file:///bunny.svg", type: "image", name: "bunny", ext: "svg", data: FACE },
    ],
  } as any);
  const program = compiler.compile({ textDocument: { uri: URI } }).program;
  const lines = text.split("\n");
  return (program.diagnostics?.[URI] ?? [])
    .map((d) => ({
      message: typeof d.message === "string" ? d.message : d.message.value,
      line: lines[d.range.start.line]!,
    }))
    .filter((d) => d.message.includes("plays on this look"));
}

describe("the choice warning follows the line's speaker (I-2390)", () => {
  test.each([
    ["narration", "  [[bunny:mouth.teeth]]\n  This is Bunny."],
    ["an inline narration line", "  [[bunny:mouth.teeth]] This is Bunny."],
    ["another character's line", "  RAFFLES:\n    [[bunny:mouth.teeth]]\n    Look at him."],
    ["another character's inline line", "  RAFFLES: [[bunny:mouth.teeth]] Look at him."],
    ["a directive before the cue", "  [[bunny:mouth.teeth]]\n\n  BUNNY:\n    Let go of that!"],
  ])("a directive on %s is not warned", (_, lines) => {
    expect(warnings(story(lines))).toEqual([]);
  });

  test.each([
    ["its define name", "  bunny:\n    [[bunny:mouth.teeth]]\n    Let go of that!"],
    ["its name", "  BUNNY:\n    [[bunny:mouth.teeth]]\n    Let go of that!"],
    ["an alias", "  STRANGER:\n    [[bunny:mouth.teeth]]\n    Let go of that!"],
    ["the as form", "  WHO as bunny:\n    [[bunny:mouth.teeth]]\n    Let go of that!"],
    ["an inline line", "  BUNNY: [[bunny:mouth.teeth]] Let go of that!"],
    ["a silent line", "  BUNNY:\n    [[bunny:mouth.teeth]]\n    . . ."],
  ])("a directive under a cue naming the character by %s is warned", (_, lines) => {
    const found = warnings(story(lines));
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("`talk` plays on this look");
    expect(found[0]!.line).toContain("[[bunny:mouth.teeth]]");
  });

  test("a morph that is not a speech morph still warns on narration", () => {
    const found = warnings(story("  [[bunny:eyes.closed]]\n  This is Bunny."));
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("`blink` plays on this look");
  });

  test("a named look's own warning is unchanged", () => {
    const text = story(
      "  [[bunny_shut]]",
      `define bunny_shut as filtered_image with
  image = image.bunny
  attributes = { "mouth.teeth" }
end
`,
    );
    const found = warnings(text);
    expect(found.map((d) => d.line)).toEqual(["define bunny_shut as filtered_image with"]);
  });
});
