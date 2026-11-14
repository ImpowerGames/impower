import { describe, expect, it } from "vitest";
import type { Game } from "../../../core/classes/Game";
import { preludeContext } from "../../../../tests/harness/compilePrelude";
import { InterpreterModule } from "./InterpreterModule";
import {
  SPAN_CLOSE,
  SPAN_END,
  scanned,
  spanOpen,
  tagCode,
} from "@impower/sparkdown/src/runtime/displayStyle";

const TARGET = "textbox";

const PRELUDE = preludeContext() as Record<string, any>;

const createModule = (overlay: Record<string, unknown> = {}) => {
  const game = {
    context: {
      ...PRELUDE,
      ...overlay,
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

const typedTimes = (source: string) =>
  createModule({ typewriter: { $default: { letter_pause: 0.05 } } })
    .parse(source, TARGET)
    .text?.[TARGET]?.map((event) => event.after ?? 0) ?? [];

const looks = (source: string) => {
  const runs: { text: string; style?: Record<string, unknown> }[] = [];
  for (const event of createModule().parse(source, TARGET).text?.[TARGET] ?? []) {
    const style = event.style && Object.keys(event.style).length ? event.style : undefined;
    const previous = runs.at(-1);
    if (previous && JSON.stringify(previous.style) === JSON.stringify(style)) {
      previous.text += event.text;
    } else {
      runs.push(style ? { text: event.text, style } : { text: event.text });
    }
  }
  return runs;
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

  describe("tags the compiler read from the grammar", () => {
    it("removes a wait tag from the visible text", () => {
      expect(render(`Wait${tagCode("wait")} here.`).text).toBe("Wait here.");
    });

    it("removes a wait tag with a duration", () => {
      expect(render(`Wait${tagCode("wait:2")} here.`).text).toBe("Wait here.");
    });

    it("removes a speed tag", () => {
      expect(render(`Speed${tagCode("speed:2")} up.`).text).toBe("Speed up.");
    });

    it("removes a pitch tag", () => {
      expect(render(`Pitch${tagCode("pitch:2")} up.`).text).toBe("Pitch up.");
    });

    it("handles a tag at the very end of a line", () => {
      expect(render(`Trailing${tagCode("wait")}`).text).toBe("Trailing");
    });

    it("removes the pitch and wait shorthands", () => {
      expect(
        render(`Short${tagCode("p:2")} pitch${tagCode("w")} and${tagCode("w:1")} wait.`).text,
      ).toBe("Short pitch and wait.");
    });

    it("removes an unknown tag", () => {
      expect(render(`Un${tagCode("bogus")} here.`).text).toBe("Un here.");
    });

    it("removes an empty tag", () => {
      expect(render(`Un${tagCode("")} here.`).text).toBe("Un here.");
    });

    it("removes an unknown tag whose value follows an equals sign", () => {
      expect(render(`Un${tagCode("bogus=2")} here.`).text).toBe("Un here.");
      expect(render(`Un${tagCode("speed=2")} here.`).text).toBe("Un here.");
    });

    it("removes an unknown tag with words after its name", () => {
      expect(render(`Un${tagCode("not a tag")} here.`).text).toBe("Un here.");
    });

    it("removes a control tag's closing form and one with more after its name", () => {
      expect(render(`Speed${tagCode("speed:2")} up${tagCode("/speed")}.`).text).toBe("Speed up.");
      expect(render(`Wait${tagCode("wait x")} here${tagCode("/wait")}.`).text).toBe("Wait here.");
      expect(render(`Pitch${tagCode("p:1")} up${tagCode("/p")}.`).text).toBe("Pitch up.");
    });

    it("changes the typing speed from the tag on", () => {
      const durations = typedTimes(`ab${tagCode("speed:0.5")}cd`);
      const plain = typedTimes("abcd");
      expect(durations.slice(0, 3)).toEqual(plain.slice(0, 3));
      expect(durations[3]! - durations[2]!).toBeCloseTo(2 * (plain[3]! - plain[2]!));
    });
  });

  describe("script text is not scanned for tags", () => {
    it("shows a tag written in script text as itself", () => {
      expect(render("Un<speed:0> here <b>x</b> <b2>.").text).toBe(
        "Un<speed:0> here <b>x</b> <b2>.",
      );
      expect(looks("A <b>word</b> here.")).toEqual([{ text: "A <b>word</b> here." }]);
    });

    it("keeps a function value's anonymous label", () => {
      expect(render("Value function: make.<anonymous>.").text).toBe(
        "Value function: make.<anonymous>.",
      );
    });
  });

  describe("look tags", () => {
    const flags: [tag: string, style: Record<string, string>][] = [
      ["b", { "text-weight": "700" }],
      ["i", { "text-style": "italic" }],
      ["u", { "text-decoration-line": "underline" }],
      ["s", { "text-decoration-line": "line-through" }],
      ["uppercase", { "text-case": "uppercase" }],
      ["allcaps", { "text-case": "uppercase" }],
      ["lowercase", { "text-case": "lowercase" }],
      ["smallcaps", { "font-variant": "small-caps" }],
      ["nobr", { "text-whitespace": "nowrap" }],
      ["sub", { "vertical-align": "sub" }],
      ["sup", { "vertical-align": "super" }],
    ];
    for (const [tag, style] of flags) {
      it(`styles the text between <${tag}> and </${tag}>`, () => {
        expect(looks(`A ${tagCode(tag)}word${tagCode(`/${tag}`)} here.`)).toEqual([
          { text: "A " },
          { text: "word", style },
          { text: " here." },
        ]);
      });
    }
    const values: [tag: string, value: string, style: Record<string, string>][] = [
      ["color", "red", { "text-color": "red" }],
      ["mark", "amber_60", { "background-color": "amber_60" }],
      ["size", "2rem", { "text-size": "2rem" }],
      ["align", "center", { text_align: "center" }],
      ["alpha", "#80", { filter: `opacity(${0x80 / 255})` }],
      ["font-weight", "300", { "text-weight": "300" }],
      ["line-height", "2", { "text-leading": "2" }],
      ["cspace", "1em", { "text-tracking": "1em" }],
      ["voffset", "1em", { "vertical-align": "1em" }],
      ["indent", "4px", { "padding-left": "4px" }],
    ];
    for (const [tag, value, style] of values) {
      it(`styles the text between <${tag}:${value}> and </${tag}>`, () => {
        expect(looks(`A ${tagCode(`${tag}:${value}`)}word${tagCode(`/${tag}`)} here.`)).toEqual([
          { text: "A " },
          { text: "word", style },
          { text: " here." },
        ]);
      });
    }

    it("breaks the line at <br>", () => {
      expect(render(`A${tagCode("br")} here.`).text).toBe("A\n here.");
    });

    it("matches a look tag's name without case", () => {
      expect(looks(`A ${tagCode("B")}word${tagCode("/B")} here.`)[1]).toEqual({
        text: "word",
        style: { "text-weight": "700" },
      });
    });

    it("reads a look tag with more after its name", () => {
      expect(looks(`A ${tagCode("b x")}word${tagCode("/b")} here.`)[1]).toEqual({
        text: "word",
        style: { "text-weight": "700" },
      });
    });

    it("combines nested look tags and closes the latest of a name", () => {
      expect(
        looks(`${tagCode("b")}a${tagCode("i")}b${tagCode("/b")}c${tagCode("/i")}d`),
      ).toEqual([
        { text: "a", style: { "text-weight": "700" } },
        { text: "b", style: { "text-weight": "700", "text-style": "italic" } },
        { text: "c", style: { "text-style": "italic" } },
        { text: "d" },
      ]);
    });

    it("styles to the end of the text when never closed", () => {
      expect(looks(`A ${tagCode("b")}word here.`)).toEqual([
        { text: "A " },
        { text: "word here.", style: { "text-weight": "700" } },
      ]);
    });

    it("leaves marks' styles as they are", () => {
      const result = render(`A ${tagCode("b")}${spanOpen("*")}word${SPAN_CLOSE}${tagCode("/b")} here.`);
      expect(result.emphasized).toEqual([{ text: "word", emphasis: ["italic"] }]);
    });
  });

  describe("tags inside an inserted value", () => {
    it("act from where the value lands to the end of the line", () => {
      expect(looks(`Everyone calls you ${scanned("<b>Ace")} around here.`)).toEqual([
        { text: "Everyone calls you " },
        { text: "Ace around here.", style: { "text-weight": "700" } },
      ]);
    });

    it("change the typing speed to the end of the line", () => {
      const slowed = typedTimes(`${scanned("<speed:0.5>")}Come closer`);
      const plain = typedTimes("Come closer");
      expect(slowed.length).toBe(plain.length);
      expect(slowed.at(-1)).toBeCloseTo(2 * plain.at(-1)!);
    });

    it("can close a tag the script opened", () => {
      expect(looks(`${tagCode("b")}a ${scanned("b</b>")} c`)).toEqual([
        { text: "a b", style: { "text-weight": "700" } },
        { text: " c" },
      ]);
    });

    it("are removed when unknown", () => {
      expect(render(`Str a ${scanned("<b2>")} c end.`).text).toBe("Str a  c end.");
    });

    it("are read in the grammar's form", () => {
      expect(render(scanned("a <speed=2>b")).text).toBe("a b");
      expect(render(scanned("x <wait\\> y")).text).toBe("x  y");
      expect(render(scanned("x <wait\\> y < c")).text).toBe("x  y < c");
      expect(render(scanned("x < c> <d")).text).toBe("x < c> <d");
      expect(render(scanned("x<b:a\\>b>y")).text).toBe("xy");
    });

    it("end with the value", () => {
      expect(render(`${scanned("<b")}old> x`).text).toBe("<bold> x");
    });
  });

  describe("hidden text", () => {
    it("omits text between the hide and show tags", () => {
      expect(render(`Hidden${tagCode("!")}secret${tagCode("/!")} shown.`).text).toBe(
        "Hidden shown.",
      );
    });

    it("hides through the end of the line when never reopened", () => {
      expect(render(`Hidden${tagCode("!")}rest of line`).text).toBe("Hidden");
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

describe("a style boundary inside zero-delay text", () => {
  const timing = (source: string) => {
    const instructions = createModule().parse(source, TARGET);
    return { end: instructions.end, audio: JSON.stringify(instructions.audio ?? {}) };
  };

  const zero = tagCode("speed:0");

  it.each([
    ["a raw span", `${zero}... a${spanOpen("`")}b${SPAN_CLOSE}c`],
    ["a centred span", `${zero}... a${spanOpen("^")}b${SPAN_CLOSE}c`],
    ["a look tag", `${zero}... a${tagCode("b")}b${tagCode("/b")}c`],
    ["a look tag with a value", `${zero}... a${tagCode("color:red")}b${tagCode("/color")}c`],
    ["an unknown tag", `${zero}... a${tagCode("b2")}b${tagCode("/b2")}c`],
    ["a look tag in a value", `${zero}... a${scanned("<b>b</b>")}c`],
  ])("glued to its neighbours, %s adds no time and no tone", (_what, styled) => {
    expect(timing(styled)).toEqual(timing(`${zero}... abc`));
  });

  it("keeps the raw span's style", () => {
    const instructions = createModule().parse(`${zero}a${spanOpen("`")}b${SPAN_CLOSE}c`, TARGET).text?.[TARGET] ?? [];
    expect(instructions.map((i) => i.text).join("")).toBe("abc");
    expect(instructions.length).toBeGreaterThan(1);
  });

  it("keeps the look tag's style", () => {
    expect(looks(`${zero}a${tagCode("b")}b${tagCode("/b")}c`)).toEqual([
      { text: "a" },
      { text: "b", style: { "text-weight": "700" } },
      { text: "c" },
    ]);
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