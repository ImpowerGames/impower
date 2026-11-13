import { describe, expect, it } from "vitest";
import type { Game } from "../../../core/classes/Game";
import { preludeContext } from "../../../../tests/harness/compilePrelude";
import { InterpreterModule } from "./InterpreterModule";
import {
  SPAN_CLOSE,
  SPAN_END,
  scanned,
  spanOpen,
} from "@impower/sparkdown/src/runtime/displayStyle";

const TARGET = "textbox";

const PRELUDE = preludeContext() as Record<string, any>;

const createModule = () => {
  const game = {
    context: {
      ...PRELUDE,
      system: {},
      character: {},
      config: {
        ...PRELUDE["config"],
        interpreter: { ...PRELUDE["config"]["interpreter"], directives: {} },
      },
    },
  } as unknown as Game;
  const module = new InterpreterModule(game);
  module.setup();
  return module;
};

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
    emphasized: spans.filter((s) => s.emphasis.length > 0),
  };
};

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

  describe("spans the compiler read from the grammar", () => {
    const span = (mark: string, text: string, close = SPAN_CLOSE) =>
      spanOpen(mark) + text + close;

    const cases: [mark: string, emphasis: string[]][] = [
      ["*", ["italic"]],
      ["_", ["underline"]],
      ["__", ["underline"]],
      ["^", ["centered"]],
      ["**", ["bold"]],
    ];

    for (const [mark, emphasis] of cases) {
      it(`a \`${mark}\` span marks its text as ${emphasis.join(" + ")}`, () => {
        const result = render(`A ${span(mark, "word")} here.`);
        expect(result.text).toBe("A word here.");
        expect(result.emphasized).toEqual([{ text: "word", emphasis }]);
      });
    }

    it("combines nested spans", () => {
      const result = render(`A ${span("**", span("*", "word"))} here.`);
      expect(result.text).toBe("A word here.");
      expect(result.emphasized).toEqual([
        { text: "word", emphasis: ["bold", "italic"] },
      ]);
    });

    it("leaves text intact for animated spans", () => {
      expect(render(`A ${span("~~", "wavy")} word.`).text).toBe("A wavy word.");
      expect(render(`A ${span("::", "shaky")} word.`).text).toBe(
        "A shaky word.",
      );
    });

    it("styles a span that runs to the end of its line", () => {
      const result = render(`A ${span("*", "rest of line", SPAN_END)}`);
      expect(result.text).toBe("A rest of line");
      expect(result.emphasized).toEqual([
        { text: "rest of line", emphasis: ["italic"] },
      ]);
    });

    it("keeps a span open across a line break inside it", () => {
      const result = render(`${span("*", "one\ntwo")} three`);
      expect(result.text).toBe("one\ntwo three");
      expect(result.emphasized.map((s) => s.text.trim())).toEqual([
        "one",
        "two",
      ]);
    });
  });

  describe("script text is not scanned for marks", () => {
    it("shows a mark character written in script text as itself", () => {
      const result = render("A *word* _here_ ^and^ **there** ~~now~~ ::too::.");
      expect(result.text).toBe(
        "A *word* _here_ ^and^ **there** ~~now~~ ::too::.",
      );
      expect(result.emphasized).toEqual([]);
    });

    it("keeps the style of a span over a mark character inside it", () => {
      const result = render(`A ${spanOpen("*")}a *b* c${SPAN_CLOSE} d`);
      expect(result.text).toBe("A a *b* c d");
      expect(result.emphasized).toEqual([
        { text: "a *b* c", emphasis: ["italic"] },
      ]);
    });

    it("shows backticks in script text as themselves", () => {
      const result = render("A `b` c");
      expect(result.text).toBe("A `b` c");
    });

    it("still reads an escape in script text", () => {
      const result = render("Esc \\*literal\\* end.");
      expect(result.text).toBe("Esc *literal* end.");
      expect(result.emphasized).toEqual([]);
    });
  });

  describe("marks inside an inserted value", () => {
    it("styles a marked value within the value", () => {
      const result = render(`Value ${scanned("*b*")} here`);
      expect(result.text).toBe("Value b here");
      expect(result.emphasized).toEqual([{ text: "b", emphasis: ["italic"] }]);
    });

    it("ends a value's unclosed mark with the value", () => {
      const result = render(`${scanned("*a")} b`);
      expect(result.text).toBe("a b");
      expect(result.emphasized).toEqual([{ text: "a", emphasis: ["italic"] }]);
    });

    it("cannot close a span written in the script", () => {
      const result = render(
        `${spanOpen("*")}far ${scanned("a* b")} away${SPAN_END}`,
      );
      expect(result.text).toBe("far a b away");
      expect(result.emphasized).toEqual([
        { text: "far a b away", emphasis: ["italic"] },
      ]);
    });
  });

  describe("choice text", () => {
    const choiceText = (content: string) => {
      const instructions =
        createModule().parse(content, TARGET, { choice: true }).text?.[TARGET] ?? [];
      return {
        text: instructions.map((i) => i.text).join(""),
        styled: instructions
          .filter((i) => emphasisOf(i.style as Record<string, unknown>).length)
          .map((i) => i.text)
          .join(""),
      };
    };

    it("is not scanned for marks", () => {
      expect(choiceText("A *word* here.")).toEqual({ text: "A *word* here.", styled: "" });
    });

    it("is styled by its codes", () => {
      expect(choiceText(`A ${spanOpen("*")}word${SPAN_CLOSE} here.`)).toEqual({
        text: "A word here.",
        styled: "word",
      });
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

    it("removes the pitch and wait shorthands", () => {
      expect(render("Short<p:2> pitch<w> and<w:1> wait.").text).toBe(
        "Short pitch and wait.",
      );
    });

    it("keeps an unrecognised tag as literal text", () => {
      expect(render("Un<bogus> here.").text).toBe("Un<bogus> here.");
    });

    it("keeps an empty tag as literal text", () => {
      expect(render("Un<> here.").text).toBe("Un<> here.");
    });

    it("keeps a function value's anonymous label", () => {
      expect(render("Value function: make.<anonymous>.").text).toBe(
        "Value function: make.<anonymous>.",
      );
    });

    it("keeps an unknown word a string interpolated into the line", () => {
      expect(render("Str a <b2> c end.").text).toBe("Str a <b2> c end.");
    });

    it("keeps an unknown tag with a value as literal text", () => {
      expect(render("Un<bogus=2> here.").text).toBe("Un<bogus=2> here.");
    });

    it("keeps an unknown tag with words after its name as literal text", () => {
      expect(render("Un<not a tag> here.").text).toBe("Un<not a tag> here.");
    });

    it("removes a control tag's closing form and one with more after its name", () => {
      expect(render("Speed<speed:2> up</speed>.").text).toBe("Speed up.");
      expect(render("Wait<wait x> here</wait>.").text).toBe("Wait here.");
      expect(render("Pitch<p:1> up</p>.").text).toBe("Pitch up.");
    });

    it("keeps an unterminated tag as literal text", () => {
      expect(render("Un<speed here.").text).toBe("Un<speed here.");
    });
  });

  describe("rich-text tags", () => {
    const flags = [
      "b",
      "i",
      "u",
      "s",
      "uppercase",
      "allcaps",
      "lowercase",
      "smallcaps",
      "nobr",
      "sub",
      "sup",
      "noparse",
    ];
    for (const tag of flags) {
      it(`removes <${tag}> and </${tag}>`, () => {
        expect(render(`A <${tag}>word</${tag}> here.`).text).toBe(
          "A word here.",
        );
      });
    }
    const values = [
      "color",
      "mark",
      "size",
      "align",
      "alpha",
      "font-weight",
      "line-height",
      "cspace",
      "voffset",
      "indent",
    ];
    for (const tag of values) {
      it(`removes <${tag}=...> and </${tag}>`, () => {
        expect(render(`A <${tag}=1>word</${tag}> here.`).text).toBe(
          "A word here.",
        );
      });
    }
    it("removes <br>", () => {
      expect(render("A<br> here.").text).toBe("A here.");
    });
    it("matches rich-text tag names without case", () => {
      expect(render("A <B>word</B> here.").text).toBe("A word here.");
    });
    it("removes a rich-text tag with more after its name", () => {
      expect(render("A <b x>word</b> here.").text).toBe("A word here.");
      expect(render("A <color:red>word</color> here.").text).toBe(
        "A word here.",
      );
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

describe("InterpreterModule.queue", () => {
  const moduleWithDefaultTarget = () => {
    const game = {
      context: {
        system: {},
        character: {},
        config: { interpreter: { directives: { action: "", title: "^" } } },
      },
    } as unknown as Game;
    const module = new InterpreterModule(game);
    module.setup();
    return module;
  };

  const shownText = (beat: ReturnType<InterpreterModule["flush"]>) =>
    Object.fromEntries(
      Object.entries(beat?.text ?? {}).map(([target, list]) => [
        target,
        list.map((t) => t.text).join(""),
      ]),
    );

  it("renders a step with flat text and no table on the default target", () => {
    const module = moduleWithDefaultTarget();
    module.queue([], [], "Plain text.\n");
    expect(shownText(module.flush())).toEqual({ action: "Plain text." });
  });

  it("renders flat text beginning with load as text", () => {
    const module = moduleWithDefaultTarget();
    module.queue([], [], "load the cart\n");
    const beat = module.flush();
    expect(beat?.load).toBeUndefined();
    expect(shownText(beat)).toEqual({ action: "load the cart" });
  });
});