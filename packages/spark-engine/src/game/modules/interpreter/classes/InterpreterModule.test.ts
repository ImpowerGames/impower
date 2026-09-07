import { describe, expect, it } from "vitest";
import type { Game } from "../../../core/classes/Game";
import { InterpreterModule } from "./InterpreterModule";

/**
 * These tests describe AUTHORED BEHAVIOUR -- "this markup produces this
 * visible text with this emphasis" -- not the shape of the runtime's
 * intermediate data.
 *
 * That distinction is deliberate: text-tag parsing is moving out of the
 * runtime and into the compiler. When that happens, `render()` and
 * `assets()` below are the only things that should need rewriting -- point
 * them at the compiler's output and every expectation in this file should
 * still hold verbatim.
 *
 * So, when adding cases here:
 *
 *   DO assert on visible text, on which spans carry which emphasis, and on
 *   which assets a line references. Those are what the author wrote and
 *   what the player perceives, and they survive the move.
 *
 *   DON'T assert on `Chunk` internals, per-letter splitting, durations, or
 *   theme-derived animation styles. Those are runtime bookkeeping, they
 *   depend on context/theme config this suite deliberately doesn't supply,
 *   and they are expected to change shape.
 */

const TARGET = "textbox";

/** The minimum context `parse()` reads. Deliberately bare -- see above. */
const createModule = () => {
  const game = {
    context: {
      system: {},
      character: {},
      config: { interpreter: { directives: {} } },
    },
  } as unknown as Game;
  const module = new InterpreterModule(game);
  module.setup();
  return module;
};

/**
 * Maps the emitted presentation style back to the authored emphasis. The
 * left-hand side is what today's runtime emits; the right-hand side is the
 * authored concept, which is what the tests actually talk about.
 */
const EMPHASIS: [key: string, value: string, name: string][] = [
  ["font_style", "italic", "italic"],
  ["text_decoration", "underline", "underline"],
  ["font_weight", "bold", "bold"],
  ["text_align", "center", "centered"],
];

const emphasisOf = (style: Record<string, unknown> | undefined): string[] => {
  if (!style) {
    return [];
  }
  return EMPHASIS.filter(([k, v]) => style[k] === v)
    .map(([, , name]) => name)
    .sort();
};

/**
 * Reduces a parsed line to what a reader perceives: the visible text, and
 * the runs of text carrying each emphasis. Adjacent pieces with identical
 * emphasis are merged, so per-letter splitting (an implementation detail of
 * the animated markers) doesn't leak into expectations.
 */
const render = (source: string) => {
  const instructions =
    createModule().parse(source, TARGET).text?.[TARGET] ?? [];
  const spans: { text: string; emphasis: string[] }[] = [];
  for (const instruction of instructions) {
    const emphasis = emphasisOf(instruction.style as Record<string, unknown>);
    const previous = spans.at(-1);
    if (previous && String(previous.emphasis) === String(emphasis)) {
      previous.text += instruction.text;
    } else {
      spans.push({ text: instruction.text, emphasis });
    }
  }
  return {
    text: spans.map((s) => s.text).join(""),
    spans,
    /** Only the spans carrying emphasis, for concise assertions. */
    emphasized: spans.filter((s) => s.emphasis.length > 0),
  };
};

/** The assets a line references, keyed by layer. */
const assets = (source: string) => {
  const instructions = createModule().parse(source, TARGET);
  const collect = (group: Record<string, any[]> | undefined) =>
    Object.fromEntries(
      Object.entries(group ?? {}).map(([layer, list]) => [
        layer,
        list.map((i) => ({ control: i.control, assets: i.assets })),
      ]),
    );
  return {
    image: collect(instructions.image),
    audio: collect(instructions.audio),
  };
};

describe("InterpreterModule text tags", () => {
  describe("plain text", () => {
    it("preserves the authored text", () => {
      expect(render("Plain text.").text).toBe("Plain text.");
    });

    // Whitespace is significant in dialogue -- the formatter is not allowed
    // to collapse runs of spaces, so the interpreter must not either.
    it("preserves consecutive spaces", () => {
      expect(render("Two  spaces.").text).toBe("Two  spaces.");
    });

    it("preserves newlines", () => {
      expect(render("Line one\nLine two").text).toBe("Line one\nLine two");
    });

    it("applies no emphasis", () => {
      expect(render("Plain text.").emphasized).toEqual([]);
    });
  });

  describe("emphasis markers", () => {
    // Fountain conventions, not Markdown ones: a single `*` is italic and
    // `_` is underline.
    const cases: [marker: string, source: string, emphasis: string[]][] = [
      ["*", "A *word* here.", ["italic"]],
      ["_", "A _word_ here.", ["underline"]],
      ["^", "A ^word^ here.", ["centered"]],
      ["**", "A **word** here.", ["bold"]],
      ["***", "A ***word*** here.", ["bold", "italic"]],
    ];

    for (const [marker, source, emphasis] of cases) {
      it(`\`${marker}\` marks text as ${emphasis.join(" + ")}`, () => {
        const result = render(source);
        expect(result.text).toBe("A word here.");
        expect(result.emphasized).toEqual([{ text: "word", emphasis }]);
      });
    }

    it("carries emphasis across multiple words", () => {
      const result = render("Multi *a b c* end.");
      expect(result.text).toBe("Multi a b c end.");
      expect(result.emphasized).toEqual([
        { text: "a b c", emphasis: ["italic"] },
      ]);
    });

    it("combines nested markers", () => {
      const result = render("Nested *_both_* end.");
      expect(result.text).toBe("Nested both end.");
      expect(result.emphasized).toEqual([
        { text: "both", emphasis: ["italic", "underline"] },
      ]);
    });

    it("treats an escaped marker as literal text", () => {
      const result = render("Esc \\*literal\\* end.");
      expect(result.text).toBe("Esc *literal* end.");
      expect(result.emphasized).toEqual([]);
    });

    // `~~` and `::` drive animations whose styling is theme-derived, so this
    // suite asserts only that they don't disturb the text the player reads.
    it("leaves text intact for animated markers", () => {
      expect(render("A ~~wavy~~ word.").text).toBe("A wavy word.");
      expect(render("A ::shaky:: word.").text).toBe("A shaky word.");
    });

    // An unclosed marker applies to the rest of the line rather than being
    // treated as literal punctuation -- the author gets the emphasis they
    // clearly meant instead of a stray marker on screen. Note this differs
    // from unterminated `<tags>`, which DO stay on screen as literal text.
    const unclosed: [marker: string, source: string, emphasis: string[]][] = [
      ["*", "A *rest of line", ["italic"]],
      ["_", "A _rest of line", ["underline"]],
      ["**", "A **rest of line", ["bold"]],
    ];

    for (const [marker, source, emphasis] of unclosed) {
      it(`applies an unclosed \`${marker}\` to the rest of the line`, () => {
        const result = render(source);
        expect(result.text).toBe("A rest of line");
        expect(result.emphasized).toEqual([{ text: "rest of line", emphasis }]);
      });
    }

    // "Rest of the line", not "rest of the text" -- the emphasis stops at
    // the newline rather than bleeding into what follows.
    it("stops an unclosed marker at the end of the line", () => {
      const result = render("Start *emphasis\nSecond line");
      expect(result.text).toBe("Start emphasis\nSecond line");
      expect(result.emphasized).toEqual([
        { text: "emphasis", emphasis: ["italic"] },
      ]);
    });
  });

  describe("control tags", () => {
    it("removes a wait tag from the visible text", () => {
      expect(render("Wait<wait> here.").text).toBe("Wait here.");
    });

    it("removes a wait tag with a duration", () => {
      expect(render("Wait<wait:2> here.").text).toBe("Wait here.");
    });

    it("removes a speed tag", () => {
      expect(render("Speed<speed:2> up.").text).toBe("Speed up.");
    });

    it("removes a pitch tag", () => {
      expect(render("Pitch<pitch:2> up.").text).toBe("Pitch up.");
    });

    it("handles a tag at the very end of a line", () => {
      expect(render("Trailing<wait>").text).toBe("Trailing");
    });

    it("drops an unrecognised tag", () => {
      expect(render("Un<bogus> here.").text).toBe("Un here.");
    });

    it("drops an empty tag", () => {
      expect(render("Un<> here.").text).toBe("Un here.");
    });

    // An unterminated tag is not a tag -- it stays on screen as authored,
    // rather than silently swallowing the rest of the line. (Unterminated
    // *emphasis markers* behave differently on purpose; see below.)
    it("keeps an unterminated tag as literal text", () => {
      expect(render("Un<speed here.").text).toBe("Un<speed here.");
    });
  });

  describe("hidden text", () => {
    it("omits text between the hide and show tags", () => {
      expect(render("Hidden<!>secret</!> shown.").text).toBe("Hidden shown.");
    });

    it("hides through the end of the line when never reopened", () => {
      expect(render("Hidden<!>rest of line").text).toBe("Hidden");
    });
  });

  describe("assets", () => {
    it("routes an image tag to the image layer, not the text", () => {
      expect(render("[[img]]").text).toBe("");
      expect(assets("[[img]]").image).toEqual({
        portrait: [{ control: "show", assets: ["img"] }],
      });
    });

    it("routes an audio tag to the audio layer, not the text", () => {
      expect(render("((sfx))").text).toBe("");
      expect(assets("((sfx))").audio).toEqual({
        sound: [{ control: "play", assets: ["sfx"] }],
      });
    });

    // An author spaces a mid-line asset tag out for readability. Removing the
    // tag must leave exactly ONE space at the junction: the space before the
    // tag is the word separator, and the space after it belongs to the tag's
    // own spacing. Two spaces would look identical on screen (the text is laid
    // out with collapsing whitespace) while lengthening the pause the
    // letter-by-letter typing puts between the words, so this is asserted on
    // the text the typing is driven from rather than by eye.
    it("leaves one space where a spaced-out asset tag was removed", () => {
      expect(render("The car ((sfx_vroom)) drove.").text).toBe(
        "The car drove.",
      );
      expect(render("The car [[img_car]] drove.").text).toBe("The car drove.");
      expect(
        render("The car ((sfx_vroom)) drove as he ((sfx_screech)) slammed.")
          .text,
      ).toBe("The car drove as he slammed.");
    });

    it("leaves no leading space when a spaced-out asset tag opens the line", () => {
      expect(render("((sfx_vroom)) The car drove.").text).toBe(
        "The car drove.",
      );
    });

    // Same rule as text tags: an unterminated asset tag is not a tag, so it
    // stays on screen as authored rather than swallowing the rest of the line.
    it("keeps an unterminated image tag as literal text", () => {
      const result = render("Look [[img and more.");
      expect(result.text).toBe("Look [[img and more.");
      expect(assets("Look [[img and more.").image).toEqual({});
    });

    it("keeps an unterminated audio tag as literal text", () => {
      const result = render("Hear ((sfx and more.");
      expect(result.text).toBe("Hear ((sfx and more.");
      expect(assets("Hear ((sfx and more.").audio).toEqual({});
    });
  });
});
