import { createMorphHost } from "@impower/sparkdown/src/morph/hosts";
import { buildMorphMotion, morphMotionKeyframes } from "@impower/sparkdown/src/morph/motion";
import { buildMorphRecipe, serializeMorphRecipe } from "@impower/sparkdown/src/morph/recipe";
import { renderMorphAt } from "@impower/sparkdown/src/morph/render";
import { MorphBakeService } from "@impower/sparkdown/src/morph/service";
import type { MorphArtifact } from "@impower/sparkdown/src/morph/types";
import NOVA from "../../../../../.agents/skills/drive-vscode-web/fixtures/pacing/project/assets/nova.svg";
import { browserAnimator, movedMarkup } from "../../../src/app/morph/MorphPlayback";
import { browserSvgLayerRasterizer } from "../../../src/app/morph/svgLayerFile";

const NATURAL = { width: 1600, height: 1200 };

const TALK = [
  { offset: 0, mouth: { state: "closed" } },
  { offset: 0.25, mouth: { state: "teeth" } },
  { offset: 0.5, mouth: { state: "open" } },
  { offset: 0.75, mouth: { state: "teeth" } },
  { offset: 1, mouth: { state: "closed" } },
];

const BLINK = [
  { offset: 0, eyes: { state: "open" } },
  {
    offset: 0.5,
    eyes: { state: "closed" },
    brows: { translate: "0 -3%", rotate: "4deg" },
    accessories: { opacity: 0.4, scale: "1.05" },
    "hair-front": { transform: "translate(40px) scale(1.06)" },
    neck: { transform: "matrix(0, 1, -1, 0, 0, 0)" },
  },
  { offset: 1, eyes: { state: "open" } },
];

const MOTION = buildMorphMotion(BLINK)!;

const recipes = {
  talk: buildMorphRecipe("talk", { blend: "cut", keyframes: TALK } as never),
  blink: buildMorphRecipe("blink", { blend: "cut", keyframes: BLINK } as never),
};

const host = createMorphHost({
  service: new MorphBakeService(),
  channel: () => ({ recipes: Object.fromEntries(Object.entries(recipes).map(([name, recipe]) => [name, serializeMorphRecipe(recipe)])), variants: {} }),
  readSource: async () => ({ text: NOVA }),
});

let artifact: MorphArtifact | undefined;

const baked = async () =>
  (artifact ??= (await host.resolve({ morphs: ["talk", "blink"], key: "nova-poses", image: "nova", selection: "{}", groups: ["mouth", "eyes"] })).artifact);

const moves = (offset: number | undefined) => (label: string) => {
  const track = MOTION[label];
  return track && offset !== undefined ? [{ track, offset }] : [];
};

const box = (id: string, width: number, height: number) => {
  const element = document.getElementById(id) ?? document.body.appendChild(Object.assign(document.createElement("div"), { id }));
  element.setAttribute("style", `width:${width}px;height:${height}px;position:relative;overflow:hidden;display:inline-block;background:#fff`);
  element.replaceChildren();
  return element;
};

async function show(offsets: Record<string, number>, width: number, height: number) {
  const art = await baked();
  if (art.status !== "live") throw new Error(`the fixture portrait baked ${art.status}`);
  const posed = renderMorphAt(art, offsets);
  const offset = offsets["blink"];
  const markup = movedMarkup(posed, document.body, NATURAL, moves(offset), browserAnimator);
  if (!markup) throw new Error("the moved pose could not be made");
  const live = box("live", width, height);
  const svg = document.importNode(new DOMParser().parseFromString(posed, "image/svg+xml").documentElement, true);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("style", "position:absolute;inset:0");
  live.appendChild(svg);
  for (const element of offset === undefined ? [] : Array.from(svg.querySelectorAll("[data-morph-motion]"))) {
    const track = MOTION[element.getAttribute("data-morph-motion")!];
    if (!track) continue;
    const animation = element.animate(morphMotionKeyframes(track) as Keyframe[], { duration: 1000, fill: "both" });
    animation.pause();
    animation.currentTime = offset! * 1000;
    animation.commitStyles();
    animation.cancel();
  }
  const drawn = box("drawn", width, height);
  const canvas = document.createElement("canvas");
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.setAttribute("style", "position:absolute;inset:0;width:100%;height:100%");
  drawn.appendChild(canvas);
  const raster = await browserSvgLayerRasterizer({ text: markup, viewBox: !!art.viewBox }, NATURAL, canvas.width, canvas.height, document);
  if (!raster) throw new Error("the rasterizer refused the pose");
  canvas.getContext("2d")!.drawImage(raster.image, 0, 0, canvas.width, canvas.height);
  raster.release();
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  return markup.length;
}

(window as unknown as { morphPoses: unknown }).morphPoses = { show };
