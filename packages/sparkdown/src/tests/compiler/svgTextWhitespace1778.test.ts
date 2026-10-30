import { describe, expect, it } from "vitest";
import { filterSVGAttributes } from "../../attributes";
import { FILTER_VERSION, getOrCreateFilteredSvg, serializeImageFilterParam, type FilteredSvgCache, type FilteredSvgFile } from "../../filters/filteredSvg";
import { parseMorphAssetRequest, serveMorphAsset } from "../../morph/assetService";
import { bakeMorphArtifact } from "../../morph/bake";
import { serializeMorphRecipe } from "../../morph/recipe";
import { renderMorphFrame } from "../../morph/render";
import { MorphBakeService } from "../../morph/service";
import { MORPH_BAKE_FORMAT } from "../../morph/types";
import { parse, stringify } from "../../txml/txml";
import { blink, portrait } from "../morph/fixtures";

const NBSP = String.fromCharCode(0xa0);
const SPACED = `<tspan>a</tspan> <tspan>b</tspan>${NBSP}c`;
const STRIPPED = "<tspan>a</tspan><tspan>b</tspan>c";
const roundTrip = (svg: string) => stringify(parse(svg));
const labelledPortrait = () => portrait({ dx: 0, dy: 0 }).replace("</svg>", `<text x="10" y="130">${SPACED}</text>\n</svg>`);

const memoryCache = () => {
  const store = new Map<string, string>();
  const cache: FilteredSvgCache & { store: Map<string, string> } = {
    store,
    match: async (key) => (store.has(key) ? new Response(store.get(key)!) : undefined),
    put: async (key, response) => {
      store.set(key, await response.text());
    },
    delete: async (key) => store.delete(key),
    keys: async () => [...store.keys()].map((url) => ({ url })),
  };
  return cache;
};

const file = (svg: string): FilteredSvgFile => new File([svg], "art.svg", { type: "image/svg+xml", lastModified: 1 }) as FilteredSvgFile;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const replaceWithStale = (cache: ReturnType<typeof memoryCache>, current: string, previous: string) => {
  const [[key, body]] = [...cache.store];
  cache.store.clear();
  cache.store.set(key!.replace(current, previous), body!.split(SPACED).join(STRIPPED));
};

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
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">\n  <text x="0" y="10">${SPACED}</text>\n</svg>`;
    expect(filterSVGAttributes(svg, {})).toBe(`<svg xmlns='http://www.w3.org/2000/svg'><text x='0' y='10'>${SPACED}</text></svg>`);
  });

  it("keeps the spacing of text in a baked morph's frames", () => {
    const artifact = bakeMorphArtifact({ source: labelledPortrait(), selection: {}, recipe: blink(), key: "k", variant: "bunny" });
    const frame = renderMorphFrame(artifact, { segment: 0, progress: 0.5 });
    expect(frame).toContain(`${SPACED}</text>`);
  });

  it("does not serve a filtered image cached by the release that stripped text whitespace", async () => {
    const cache = memoryCache();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><g data-name="label.on"><text x="0" y="10">${SPACED}</text></g></svg>`;
    const param = serializeImageFilterParam({ label: "on" })!;
    await getOrCreateFilteredSvg(cache, "local/art.svg", file(svg), param);
    await flush();
    replaceWithStale(cache, `fv=${FILTER_VERSION}`, "fv=3");
    const served = await getOrCreateFilteredSvg(cache, "local/art.svg", file(svg), param);
    expect(await served!.text()).toContain(SPACED);
  });

  it("does not serve a morph artifact cached by the release that stripped text whitespace", async () => {
    const cache = memoryCache();
    const svg = labelledPortrait();
    const request = parseMorphAssetRequest(new URLSearchParams({ attributes: "{}", morph: serializeMorphRecipe(blink()), key: "ref-key" }));
    if (!request || request === "invalid") throw new Error("unreadable request");
    await serveMorphAsset({ service: new MorphBakeService(), cache, path: "local/art.svg", file: file(svg), request });
    await flush();
    replaceWithStale(cache, `bf=${MORPH_BAKE_FORMAT}`, "bf=18");
    const served = await (await serveMorphAsset({ service: new MorphBakeService(), cache, path: "local/art.svg", file: file(svg), request })).text();
    expect(served).toContain(SPACED);
    expect(served).not.toContain(STRIPPED);
  });
});
