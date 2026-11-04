import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { parseMorphRecipe } from "../../morph/recipe";

const URI = "file:///main.sd";

const PORTRAIT = `<svg xmlns="http://www.w3.org/2000/svg">
<g data-name="eyes.open:default"><path data-name="eyelash-left" d="M0,0H1V1H0Z"/></g>
<g data-name="eyes.closed"><path data-name="eyelash-left" d="M0,0H1V1H0Z"/></g>
<g data-name="eyebrows">
<path data-name="brow:brows.up:default" d="M0,0H1V1H0Z"/>
<path data-name="brow:brows.down" d="M0,0H1V1H0Z"/>
</g>
<path data-name="nose" d="M0,0H1V1H0Z"/>
</svg>`;

function compile(text: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri: URI, type: "script", name: "main", ext: "sd", text: `${text}\nscene start\nend\n`, version: 1, languageId: "sparkdown" },
      { uri: "file:///bunny.svg", type: "image", name: "bunny", ext: "svg", data: PORTRAIT },
    ],
  } as any);
  return compiler.compile({ textDocument: { uri: URI } }).program;
}

function morphIssues(text: string) {
  const lines = text.split("\n");
  return (compile(text).diagnostics?.[URI] ?? [])
    .filter((d) => d.code === "morph")
    .map((d) => ({
      message: typeof d.message === "string" ? d.message : d.message.value,
      severity: d.severity,
      text: lines[d.range.start.line]!.slice(d.range.start.character, d.range.end.character),
    }));
}

const morph = (first: string, middle: string, last = "eyes { state = open }") => `morph blink {
  method = bend
  layers { brow { blend = fade } }
  keyframes {
    0% { ${first} }
    33.333% { ${middle} }
    100% { ${last} }
  }
}
`;

describe("secondary states and layer motion in a morph declaration", () => {
  test("a pose drives a second group and moves layers with supported 2D values, without a diagnostic", () => {
    const text = morph(
      "eyes { state = open }; brows { state = up }",
      "eyes { state = closed }; brows { state = brows.down }; eyebrows { translate = 0 8px; transform_origin = left top }; nose { transform = skewX(4deg) translate(0, -2px); opacity = 90% }",
      "eyes { state = open }; brows { state = up }",
    );
    expect(morphIssues(text)).toEqual([]);
    const program = compile(text);
    const recipe = parseMorphRecipe(program.morphs!.recipes["blink"]!)!;
    expect(recipe.motion).toEqual(["eyebrows", "nose"]);
    expect(recipe.keyframes.map((k) => k.states)).toEqual([
      { brows: "up", eyes: "open" },
      { brows: "down", eyes: "closed" },
      { brows: "up", eyes: "open" },
    ]);
    expect(program.morphs!.variants["bunny"]![0]!.groups).toEqual(["eyes", "brows"]);
  });

  test("a group whose first state comes after the first keyframe is refused: every driven group starts from an explicit state", () => {
    const issues = morphIssues(morph("eyes { state = open }", "eyes { state = closed }; brows { state = down }", "eyes { state = open }; brows { state = up }"));
    expect(issues).toContainEqual(
      expect.objectContaining({ severity: 1, text: "down", message: expect.stringContaining("`brows` takes a `state` in a later keyframe but not in the first one") }),
    );
  });

  test.each([
    ["a bare length", "nose { translate = 0 8 }", "0 8", "A bare number other than `0` needs `px`"],
    ["an individual 3D rotation", "nose { rotate = x 30deg }", "x 30deg", "Only 2D rotation is supported"],
    ["a 3D function in a list", "nose { transform = translate(1px, 0) rotateY(10deg) }", "translate(1px, 0) rotateY(10deg)", "3D transforms are not supported"],
    ["a 3D origin", "nose { transform_origin = left top 5px }", "left top 5px", "Only a 2D `transform_origin` is supported"],
    ["an unknown layer property", "nose { skew = 2deg }", "skew", "Unknown morph field `skew`"],
  ])("%s is refused where it is written", (_name, container, text, message) => {
    const issues = morphIssues(morph("eyes { state = open }", `eyes { state = closed }; ${container}`));
    expect(issues).toContainEqual(expect.objectContaining({ severity: 1, text, message: expect.stringContaining(message) }));
  });

  test("a moved label no image draws is reported on the container", () => {
    const issues = morphIssues(morph("eyes { state = open }", "eyes { state = closed }; whiskers { translate = 0 1px }"));
    expect(issues).toContainEqual(expect.objectContaining({ severity: 2, text: "whiskers", message: "No image the morph applies to has a layer labelled `whiskers`." }));
  });
});
