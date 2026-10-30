import { describe, expect, it } from "vitest";
import { filterSVGAttributes } from "../../attributes";
import { bakeMorphArtifact } from "../../morph/bake";
import { renderMorphFrame } from "../../morph/render";
import { parse, stringify } from "../../txml/txml";
import { blink, portrait } from "../morph/fixtures";

const NBSP = " ";
const roundTrip = (svg: string) => stringify(parse(svg));

describe("SVG text keeps the whitespace a browser renders", () => {
  it.each([
    [`<text>${NBSP}hi${NBSP}</text>`],
    ['<text xml:space="preserve">  a  b </text>'],
    ["<text><tspan>a</tspan> <tspan>b</tspan></text>"],
    ["<text>a <tspan>b</tspan> c</text>"],
    ["<text>\n  <tspan>a</tspan>\n  <tspan>b</tspan>\n</text>"],
    [`<svg><foreignObject><div>a <b>b</b>${NBSP}</div></foreignObject></svg>`],
  ])("round-trips %j unchanged", (svg) => {
    expect(roundTrip(svg)).toBe(svg);
  });

  it("drops indentation between elements outside text", () => {
    expect(roundTrip('<svg>\n  <g>\n    <path d="M0,0"></path>\n  </g>\n</svg>')).toBe('<svg><g><path d="M0,0"></path></g></svg>');
  });

  it("keeps a no-break space that pads text outside a text element", () => {
    expect(roundTrip(`<svg><title> ${NBSP}portrait${NBSP} </title></svg>`)).toBe(`<svg><title>${NBSP}portrait${NBSP}</title></svg>`);
  });

  it("keeps the spacing of text in the player's static image", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">\n  <text x="0" y="10"><tspan>a</tspan> <tspan>b</tspan>${NBSP}c</text>\n</svg>`;
    expect(filterSVGAttributes(svg, {})).toBe(`<svg xmlns='http://www.w3.org/2000/svg'><text x='0' y='10'><tspan>a</tspan> <tspan>b</tspan>${NBSP}c</text></svg>`);
  });

  it("keeps the spacing of text in a baked morph's frames", () => {
    const label = `<text x="10" y="130"><tspan>a</tspan> <tspan>b</tspan>${NBSP}c</text>`;
    const source = portrait({ dx: 0, dy: 0 }).replace("</svg>", `${label}\n</svg>`);
    const artifact = bakeMorphArtifact({ source, selection: {}, recipe: blink(), key: "k", variant: "bunny" });
    const frame = renderMorphFrame(artifact, { segment: 0, progress: 0.5 });
    expect(frame).toContain(`<tspan>a</tspan> <tspan>b</tspan>${NBSP}c</text>`);
  });
});
