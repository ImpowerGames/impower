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

function compilerFor(text: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" },
      { uri: "file:///bunny.svg", type: "image", name: "bunny", ext: "svg", data: FACE },
      { uri: "file:///raffles.svg", type: "image", name: "raffles", ext: "svg", data: FACE },
    ],
  } as any);
  return compiler;
}

function warnings(text: string, compiler = compilerFor(text)) {
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

describe("the choice warning follows the line's speaker (I-2390)", () => {
  test.each([
    ["narration", "  [[bunny:mouth.teeth]]\n  This is Bunny."],
    ["an inline narration line", "  [[bunny:mouth.teeth]] This is Bunny."],
    ["another character's line", "  RAFFLES:\n    [[bunny:mouth.teeth]]\n    Look at him."],
    ["another character's inline line", "  RAFFLES: [[bunny:mouth.teeth]] Look at him."],
    ["a directive line above narration, after a blank line", "  [[bunny:mouth.teeth]]\n\n  This is Bunny."],
    ["a directive line above another character's cue", "  [[bunny:mouth.teeth]]\n  RAFFLES:\n    Look at him."],
    ["a directive line above another character's cue, after a blank line", "  [[bunny:mouth.teeth]]\n\n  RAFFLES:\n    Look at him."],
    ["a directive line with no display line after it", "  [[bunny:mouth.teeth]]"],
    ["an inline cue holding only the directive, above narration", "  BUNNY: [[bunny:mouth.teeth]]\n  Bunny waits silently."],
  ])("a directive on %s is not warned", (_, lines) => {
    expect(warnings(story(lines))).toEqual([]);
  });

  test.each([
    ["the cue's define name", "  bunny:\n    [[bunny:mouth.teeth]]\n    Let go of that!"],
    ["the cue's name", "  BUNNY:\n    [[bunny:mouth.teeth]]\n    Let go of that!"],
    ["an alias on the cue", "  STRANGER:\n    [[bunny:mouth.teeth]]\n    Let go of that!"],
    ["the cue's as form", "  WHO as bunny:\n    [[bunny:mouth.teeth]]\n    Let go of that!"],
    ["an inline cue", "  BUNNY: [[bunny:mouth.teeth]] Let go of that!"],
    ["a cue over a silent line", "  BUNNY:\n    [[bunny:mouth.teeth]]\n    . . ."],
    ["the cue below a directive line", "  [[bunny:mouth.teeth]]\n  BUNNY:\n    Let go of that!"],
    ["the cue below a directive line and a blank line", "  [[bunny:mouth.teeth]]\n\n  BUNNY:\n    Let go of that!"],
    ["the cue below a directive line with a comment", "  [[bunny:mouth.teeth]] // Bunny looks up\n  BUNNY:\n    Let go of that!"],
    ["the cue below a directive line and a variable statement", "  [[bunny:mouth.teeth]]\n  local n = 1\n  BUNNY:\n    Let go of that!"],
    ["the cue over a block whose last line is the directive", "  BUNNY:\n    Let go of that!\n    [[bunny:mouth.teeth]]\n  RAFFLES:\n    Look at him."],
    ["the cue below a styled directive line", "  **[[bunny:mouth.teeth]]**\n  BUNNY:\n    Let go of that!"],
  ])("a directive shown on the character's line, named by %s, is warned", (_, lines) => {
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

  test("in a composition only the speaking character's portrait is warned", () => {
    const found = warnings(story("  BUNNY:\n    [[bunny:mouth.teeth + raffles:mouth.teeth]]\n    Let go of that!"));
    expect(found).toHaveLength(1);
    expect(found[0]!.range).toEqual("mouth.teeth");
    expect(found[0]!.at).toBeLessThan("    [[bunny:mouth.teeth + ".length);
  });

  test("a named layered image is warned only for the layer of the character who speaks", () => {
    const PAIR = "define pair as layered_image with\n  assets = { image.bunny, image.raffles }\nend\n";
    expect(warnings(story("  BUNNY:\n    [[pair:mouth.teeth]]\n    Let go of that!", PAIR))).toHaveLength(1);
    expect(warnings(story("  RAFFLES:\n    [[pair:mouth.teeth]]\n    Look at him.", PAIR))).toHaveLength(1);
    expect(warnings(story("  [[pair:mouth.teeth]]\n  There they are.", PAIR))).toEqual([]);
    const SOLO = "define solo as layered_image with\n  assets = { image.bunny }\nend\n";
    expect(warnings(story("  BUNNY:\n    [[solo:mouth.teeth]]\n    Let go of that!", SOLO))).toHaveLength(1);
    expect(warnings(story("  [[solo:mouth.teeth]]\n  There he is.", SOLO))).toEqual([]);
  });

  test("a divert cycle after a directive line ends the walk and names nobody", () => {
    const text = story("  [[bunny:mouth.teeth]]\n  -> a\nend\n\nscene a\n  -> b\nend\n\nscene b\n  -> a");
    expect(warnings(text)).toEqual([]);
  });

  test("a directive line read past a statement keeps its warning after an edit elsewhere recompiles (I-2442)", () => {
    const text = `${story("  [[bunny:mouth.teeth]]\n  local n = 1\n  BUNNY:\n    Let go of that!")}\nscene other\n  Elsewhere.\nend\n`;
    const compiler = compilerFor(text);
    expect(warnings(text, compiler)).toHaveLength(1);
    const offset = text.indexOf("Elsewhere.");
    const before = text.slice(0, offset).split("\n");
    const at = { line: before.length - 1, character: before.at(-1)!.length };
    compiler.updateDocument({
      textDocument: { uri: URI, version: 2 },
      contentChanges: [{ range: { start: at, end: { line: at.line, character: at.character + "Elsewhere".length } }, text: "Somewhere else" }],
    } as never);
    const edited = text.replace("Elsewhere.", "Somewhere else.");
    const found = warnings(edited, compiler);
    expect(found).toHaveLength(1);
    expect(found[0]!.line).toContain("[[bunny:mouth.teeth]]");
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
