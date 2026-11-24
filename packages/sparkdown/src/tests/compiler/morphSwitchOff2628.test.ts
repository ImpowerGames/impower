import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { bindMorph } from "../../compiler/morph/bindMorph";

const URI = "file:///main.sd";

function compile(text: string, svg: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri: URI, type: "script", name: "main", ext: "sd", text: `${text}scene start\n  [[bunny]]\nend\n`, version: 1, languageId: "sparkdown" },
      { uri: "file:///bunny.svg", type: "image", name: "bunny", ext: "svg", data: svg },
    ],
  } as any);
  return compiler.compile({ textDocument: { uri: URI } }).program;
}

const morph = (name: string, group: string, states: [string, string, string], clips = "") => `morph ${name} {
  method = bend
  keyframes {
    from {
      ${group} {
        state = ${states[0]}
      }
    }
    50% {
      ${group} {
        state = ${states[1]}
      }
    }
    to {
      ${group} {
        state = ${states[2]}
      }
    }
  }
${clips}}
`;

const bindingOf = (text: string, name: string, svg: string) => {
  const program = compile(text, svg);
  return bindMorph(program.context!, program.context!["morph"]![name]);
};

const morphWarnings = (text: string, svg: string) =>
  (compile(text, svg).diagnostics?.[URI] ?? [])
    .filter((d) => d.code === "morph")
    .map((d) => (typeof d.message === "string" ? d.message : d.message.value));

const LIDDED = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<path data-name="face" d="M0,0H100V100H0Z" fill="#fdb"/>
<path data-name="lid lids.on" d="M10,10H90V40H10Z" fill="#a76"/>
</svg>`;

describe("a switch's off state needs no layer of its own", () => {
  test("a portrait whose only lids layer is lids.on binds a morph that goes off, on, off", () => {
    const text = morph("lower", "lids", ["off", "on", "off"]);
    const binding = bindingOf(text, "lower", LIDDED);
    const variant = binding.candidates[0]!.variants[0]!;
    expect(variant.status).toBe("active");
    expect(variant.problems).toEqual([]);
    expect(morphWarnings(text, LIDDED).filter((m) => m.includes("does not apply"))).toEqual([]);
    expect(compile(text, LIDDED).morphs!.variants["bunny"]).toHaveLength(1);
  });

  test("a switch's on state still has to be drawn", () => {
    const offOnly = LIDDED.replace("lid lids.on", "lid lids.off");
    const text = morph("lower", "lids", ["off", "on", "off"]);
    expect(bindingOf(text, "lower", offOnly).candidates[0]!.variants[0]!.status).toBe("skipped");
    expect(morphWarnings(text, offOnly).some((m) => m.includes('draws no `lids.on`'))).toBe(true);
  });

  test("a group with named options still skips a look whose folder lacks a named state, with today's warning", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
<g data-name="left" id="left">
  <g data-name="lid eyes.open default" id="l-open"/>
  <g data-name="lid eyes.closed" id="l-closed"/>
</g>
<g data-name="right" id="right">
  <g data-name="lid eyes.open default" id="r-open"/>
</g>
</svg>`;
    const text = morph("blink", "eyes", ["open", "closed", "open"]);
    expect(bindingOf(text, "blink", svg).candidates[0]!.variants[0]!.status).toBe("skipped");
    const warning = morphWarnings(text, svg).find((m) => m.includes("does not apply to `bunny`"));
    expect(warning).toContain('folder "right" draws no `eyes.closed`');
  });
});

describe("a clip label no portrait draws is still reported where it is written", () => {
  test("a blink whose clip labels the portrait lacks binds, and its clip labels are flagged", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<g data-name="eyes.open default"><path data-name="eye-line" d="M0,50 C30,5 70,5 100,50Z"/></g>
<g data-name="eyes.closed"><path data-name="eye-line" d="M0,50 C30,44 70,44 100,50Z"/></g>
</svg>`;
    const clips = `  clips {
    {
      between {
        eyelash-left
      }
      targets {
        eyeball-white-left
      }
    }
  }
`;
    const text = morph("blink", "eyes", ["open", "closed", "open"], clips);
    expect(bindingOf(text, "blink", svg).candidates[0]!.variants[0]!.status).toBe("active");
    const warnings = morphWarnings(text, svg);
    expect(warnings).toContain("No image the morph applies to has a layer labelled `eyelash-left`.");
    expect(warnings).toContain("No image the morph applies to has a layer labelled `eyeball-white-left`.");
  });
});
