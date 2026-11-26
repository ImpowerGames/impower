import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../src/compiler/classes/SparkdownCompiler";

const URI = "file:///main.sd";

const FACE = `<svg xmlns="http://www.w3.org/2000/svg">
<g data-name="lids eyes.open default" id="open"/>
<g data-name="lids eyes.closed" id="closed"/>
<g data-name="lips mouth.open default" id="m-open"/>
<g data-name="lips mouth.closed" id="m-closed"/>
<g data-name="lips mouth.teeth" id="m-teeth"/>
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
      { uri: "file:///raffles.svg", type: "image", name: "raffles", ext: "svg", data: FACE },
    ],
  } as any);
  const program = compiler.compile({ textDocument: { uri: URI } }).program;
  const lines = text.split("\n");
  return (program.diagnostics?.[URI] ?? [])
    .map((d) => ({
      message: typeof d.message === "string" ? d.message : d.message.value,
      line: lines[d.range.start.line]!,
      at: d.range.start.character,
      range: lines[d.range.start.line]!.slice(d.range.start.character, d.range.end.character),
    }))
    .filter((d) => d.message.includes("plays on this look"));
}

describe("a speech morph's override is never warned, on any line; other morphs are (I-2442)", () => {
  const PAIR = "define pair as layered_image with\n  assets = { image.bunny, image.raffles }\nend\n";
  const SHUT = 'define bunny_shut as filtered_image with\n  image = image.bunny\n  attributes = { "mouth.teeth" }\nend\n';
  test.each([
    ["narration", "  [[bunny:mouth.teeth]]\n  This is Bunny.", ""],
    ["another character's line", "  RAFFLES:\n    [[bunny:mouth.teeth]]\n    Look at him.", ""],
    ["the character's cue", "  BUNNY:\n    [[bunny:mouth.teeth]]\n    Let go of that!", ""],
    ["the character's inline cue", "  BUNNY: [[bunny:mouth.teeth]] Let go of that!", ""],
    ["a directive line above the character's cue", "  [[bunny:mouth.teeth]]\n  BUNNY:\n    Let go of that!", ""],
    ["a directive line above a statement and the character's cue", "  [[bunny:mouth.teeth]]\n  local n = 1\n  BUNNY:\n    Let go of that!", ""],
    ["a composition under the character's cue", "  BUNNY:\n    [[bunny:mouth.teeth + raffles:mouth.teeth]]\n    Let go of that!", ""],
    ["a layered image under the character's cue", "  BUNNY:\n    [[pair:mouth.teeth]]\n    Let go of that!", PAIR],
    ["a named look shown under the character's cue", "  BUNNY:\n    [[bunny_shut]]\n    Let go of that!", SHUT],
  ])("a speech morph resting over the choice gives no warning on %s", (_, lines, head) => {
    expect(warnings(story(lines, head))).toEqual([]);
  });

  test.each([
    ["narration", "  [[bunny:eyes.closed]]\n  This is Bunny."],
    ["the character's cue", "  BUNNY:\n    [[bunny:eyes.closed]]\n    Let go of that!"],
    ["a directive line above the character's cue", "  [[bunny:eyes.closed]]\n  BUNNY:\n    Let go of that!"],
  ])("a morph that is not a speech morph still warns on %s", (_, lines) => {
    const found = warnings(story(lines));
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("`blink` plays on this look");
    expect(found[0]!.line).toContain("[[bunny:eyes.closed]]");
  });

  test("a named look choosing a state a morph that is not a speech morph rests over still warns on its declaration", () => {
    const text = story(
      "  [[bunny_lidded]]",
      'define bunny_lidded as filtered_image with\n  image = image.bunny\n  attributes = { "eyes.closed" }\nend\n',
    );
    const found = warnings(text);
    expect(found.map((d) => d.line)).toEqual(["define bunny_lidded as filtered_image with"]);
    expect(found[0]!.message).toContain("`blink` plays on this look");
  });
});
