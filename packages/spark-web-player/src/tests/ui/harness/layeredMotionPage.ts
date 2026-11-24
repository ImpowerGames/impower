import { createMorphHost, layeredMorphSource } from "@impower/sparkdown/src/morph/hosts";
import { buildMorphMotion, morphMotionKeyframes } from "@impower/sparkdown/src/morph/motion";
import { buildMorphRecipe, serializeMorphRecipe } from "@impower/sparkdown/src/morph/recipe";
import { MorphBakeService } from "@impower/sparkdown/src/morph/service";
import { MorphPlayback } from "../../../app/morph/MorphPlayback";

const WIDTH = 400;
const HEIGHT = 600;
const SHOWN_WIDTH = 200;
const SHOWN_HEIGHT = 300;
const SVG_NS = "http://www.w3.org/2000/svg";

const paintFile = (draw: (context: CanvasRenderingContext2D) => void) => {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  draw(canvas.getContext("2d")!);
  return canvas.toDataURL("image/png");
};

const FILES = {
  base: paintFile((context) => {
    const gradient = context.createLinearGradient(0, 0, WIDTH, HEIGHT);
    gradient.addColorStop(0, "#f2d3b8");
    gradient.addColorStop(1, "#8fb4d9");
    context.fillStyle = gradient;
    context.fillRect(0, 0, WIDTH, HEIGHT);
    context.fillStyle = "#c58f6a";
    context.beginPath();
    context.ellipse(200, 260, 130, 170, 0, 0, Math.PI * 2);
    context.fill();
  }),
  brows: paintFile((context) => {
    const gradient = context.createLinearGradient(110, 0, 290, 0);
    gradient.addColorStop(0, "#3a2416");
    gradient.addColorStop(1, "#7a4a2a");
    context.fillStyle = gradient;
    context.beginPath();
    context.ellipse(150, 190, 45, 12, -0.15, 0, Math.PI * 2);
    context.ellipse(250, 190, 45, 12, 0.15, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "rgba(30, 60, 120, 0.6)";
    context.fillRect(170, 330, 60, 40);
  }),
  lids: paintFile(() => {}),
};

const CONTEXT = {
  image: Object.fromEntries(Object.entries(FILES).map(([name, src]) => [name, { $type: "image", $name: name, src, uri: `file:///${name}.png` }])),
  layered_image: {
    kit: {
      $type: "layered_image",
      $name: "kit",
      assets: { base: { $name: "base" }, brows: { $name: "brows" }, "lids.on": { $name: "lids" } },
    },
  },
};

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

async function until(check: () => boolean) {
  for (let i = 0; i < 400; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("The picture's canvas never appeared.");
}

async function show(moved: Record<string, string>, progress: number) {
  document.body.replaceChildren();
  const keyframes = [
    { offset: 0, lids: { state: "off" } },
    { offset: 0.5, lids: { state: "on" } },
    { offset: 1, lids: { state: "off" }, brows: moved },
  ];
  const motion = buildMorphMotion(keyframes);
  if (!motion?.["brows"]) throw new Error("The keyframes moved nothing.");

  const overlay = document.body.appendChild(document.createElement("div"));
  overlay.setAttribute("style", "display:flex;gap:20px;padding:10px;background:#fff");
  const ours = overlay.appendChild(document.createElement("span"));
  ours.id = "ours";
  const background = `url("${FILES.brows}"), url("${FILES.base}")`;
  ours.setAttribute(
    "style",
    `display:block;position:relative;width:${SHOWN_WIDTH}px;height:${SHOWN_HEIGHT}px;background-image:${background};background-size:100% 100%;background-repeat:no-repeat`,
  );
  const theirs = overlay.appendChild(document.createElementNS(SVG_NS, "svg"));
  theirs.id = "theirs";
  theirs.setAttribute("width", String(SHOWN_WIDTH));
  theirs.setAttribute("height", String(SHOWN_HEIGHT));
  theirs.setAttribute("viewBox", `0 0 ${WIDTH} ${HEIGHT}`);
  theirs.setAttribute("style", "display:block;overflow:hidden");
  const image = (src: string) => {
    const element = document.createElementNS(SVG_NS, "image");
    element.setAttribute("href", src);
    element.setAttribute("x", "0");
    element.setAttribute("y", "0");
    element.setAttribute("width", String(WIDTH));
    element.setAttribute("height", String(HEIGHT));
    element.setAttribute("preserveAspectRatio", "none");
    return element;
  };
  theirs.appendChild(image(FILES.base));
  const group = theirs.appendChild(document.createElementNS(SVG_NS, "g"));
  group.setAttribute("style", "transform-box:fill-box;transform-origin:50% 50%");
  group.appendChild(image(FILES.brows));
  const animation = group.animate(morphMotionKeyframes(motion["brows"]) as Keyframe[], { duration: 1000, fill: "both" });
  animation.pause();
  animation.currentTime = progress * 1000;

  const recipe = serializeMorphRecipe(buildMorphRecipe("m", { blend: "cut", keyframes } as never));
  const host = createMorphHost({
    service: new MorphBakeService(),
    channel: () => ({ recipes: { m: recipe }, variants: {} }),
    readSource: layeredMorphSource(() => CONTEXT as never),
  });
  const playback = new MorphPlayback(overlay, { host, seed: "s", requestFrame: () => 0, cancelFrame: () => {} });
  playback.mount(
    ours,
    {
      plays: [
        {
          layer: 0,
          picture: { span: 2, files: Object.entries(FILES).map(([name, src]) => ({ src, name: `${name}.png` })) },
          ref: { morphs: ["m"], key: "kit", image: "kit", selection: "{}", groups: ["lids"] },
          morph: "m",
          timing: { duration: 1, delay: 0, easing: "linear", iterations: 1, direction: "normal" },
          motion,
          definition: "d",
        },
      ],
      epoch: 0,
    },
    background,
    "background",
    "portrait:0",
  );
  await until(() => !!ours.querySelector("span.morph")?.shadowRoot?.querySelector("canvas"));
  playback.advance(progress);
  await nextFrame();
}

(window as unknown as { layeredMotion: unknown }).layeredMotion = { show };
