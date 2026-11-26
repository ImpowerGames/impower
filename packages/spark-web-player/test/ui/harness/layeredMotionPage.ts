import { createMorphHost, layeredMorphSource } from "@impower/sparkdown/src/morph/hosts";
import { buildMorphMotion, morphMotionKeyframes } from "@impower/sparkdown/src/morph/motion";
import { buildMorphRecipe, serializeMorphRecipe } from "@impower/sparkdown/src/morph/recipe";
import { MorphBakeService } from "@impower/sparkdown/src/morph/service";
import { browserPictureLoader, MorphPlayback, paintsAnything } from "../../../src/app/morph/MorphPlayback";
import { browserSvgLayerRasterizer, readSvgLayer } from "../../../src/app/morph/svgLayerFile";

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

const GROUP_FILES = {
  base: paintFile((context) => {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, WIDTH, HEIGHT);
  }),
  red: paintFile((context) => {
    context.fillStyle = "#e02020";
    context.fillRect(80, 160, 180, 220);
  }),
  blue: paintFile((context) => {
    context.fillStyle = "#2040e0";
    context.fillRect(160, 240, 160, 200);
  }),
};

const GROUP_ARTWORK =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
  '<image data-name="base" data-layer="0" x="0" y="0" width="100" height="100"/>' +
  '<g data-name="face"><image data-name="red" data-layer="1" x="0" y="0" width="100" height="100"/>' +
  '<image data-name="blue" data-layer="2" x="0" y="0" width="100" height="100"/></g></svg>';

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

async function until(check: () => boolean) {
  for (let i = 0; i < 400; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("The picture's canvas never appeared.");
}

interface Picture {
  files: Record<string, string>;
  shown: string[];
  moved: string;
  keyframes: Record<string, unknown>[];
  readSource: Parameters<typeof createMorphHost>[0]["readSource"];
  groups: string[];
}

async function draw(picture: Picture, progress: number, shift = 0) {
  document.body.replaceChildren();
  const motion = buildMorphMotion(picture.keyframes);
  if (!motion?.[picture.moved]) throw new Error("The keyframes moved nothing.");

  const overlay = document.body.appendChild(document.createElement("div"));
  overlay.setAttribute("style", "display:flex;gap:20px;padding:10px;background:#fff");
  const ours = overlay.appendChild(document.createElement("span"));
  ours.id = "ours";
  const background = [...picture.shown].reverse().map((name) => `url("${picture.files[name]}")`).join(", ");
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
  const [bottom, ...moved] = picture.shown;
  theirs.appendChild(image(picture.files[bottom!]!));
  const offset = theirs.appendChild(document.createElementNS(SVG_NS, "g"));
  if (shift) offset.setAttribute("transform", `translate(${shift} 0)`);
  const group = offset.appendChild(document.createElementNS(SVG_NS, "g"));
  group.setAttribute("style", "transform-box:fill-box;transform-origin:50% 50%");
  for (const name of moved) group.appendChild(image(picture.files[name]!));
  const animation = group.animate(morphMotionKeyframes(motion[picture.moved]!) as Keyframe[], { duration: 1000, fill: "both" });
  animation.pause();
  animation.currentTime = progress * 1000;

  const recipe = serializeMorphRecipe(buildMorphRecipe("m", { blend: "cut", keyframes: picture.keyframes } as never));
  const host = createMorphHost({
    service: new MorphBakeService(),
    channel: () => ({ recipes: { m: recipe }, variants: {} }),
    readSource: picture.readSource,
  });
  const playback = new MorphPlayback(overlay, { host, seed: "s", requestFrame: () => 0, cancelFrame: () => {} });
  playback.mount(
    ours,
    {
      plays: [
        {
          layer: 0,
          picture: { span: picture.shown.length, files: Object.entries(picture.files).map(([name, src]) => ({ src, name: `${name}.png` })) },
          ref: { morphs: ["m"], key: "kit", image: "kit", selection: "{}", groups: picture.groups },
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

type Matrix = [number, number, number, number, number, number];

const times = ([a, b, c, d, e, f]: Matrix, [g, h, i, j, k, l]: Matrix): Matrix => [
  a * g + c * h,
  b * g + d * h,
  a * i + c * j,
  b * i + d * j,
  a * k + c * l + e,
  b * k + d * l + f,
];

const shifted = (x: number, y: number): Matrix => [1, 0, 0, 1, x, y];
const turned = (degrees: number): Matrix => {
  const r = (degrees * Math.PI) / 180;
  return [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0];
};
const scaled = (x: number, y: number): Matrix => [x, 0, 0, y, 0, 0];

const length = (value: string, of: number) => (value.endsWith("%") ? (parseFloat(value) / 100) * of : parseFloat(value));

function listMatrix(list: string, progress: number): Matrix {
  let matrix: Matrix = [1, 0, 0, 1, 0, 0];
  for (const [, name, args] of list.matchAll(/(rotate|translate|scale)\(([^)]*)\)/g)) {
    const values = args!.split(/[\s,]+/).filter(Boolean);
    if (name === "rotate") matrix = times(matrix, turned(parseFloat(values[0]!) * progress));
    if (name === "translate") matrix = times(matrix, shifted(length(values[0]!, WIDTH) * progress, length(values[1] ?? "0", HEIGHT) * progress));
    if (name === "scale") {
      const x = parseFloat(values[0]!);
      const y = values[1] === undefined ? x : parseFloat(values[1]);
      matrix = times(matrix, scaled(1 + (x - 1) * progress, 1 + (y - 1) * progress));
    }
  }
  return matrix;
}

function expectedPose(moved: Record<string, string>, progress: number): Matrix {
  const [tx = "0", ty = "0"] = (moved["translate"] ?? "0").split(/\s+/);
  const [sx = "1", sy = sx] = (moved["scale"] ?? "1").split(/\s+/);
  const [ox = "50%", oy = "50%"] = (moved["transform_origin"] ?? "50% 50%").split(/\s+/);
  const origin = [WIDTH / 2 + (length(ox, WIDTH) - WIDTH / 2) * progress, HEIGHT / 2 + (length(oy, HEIGHT) - HEIGHT / 2) * progress] as const;
  let matrix = shifted(origin[0], origin[1]);
  matrix = times(matrix, shifted(length(tx, WIDTH) * progress, length(ty, HEIGHT) * progress));
  matrix = times(matrix, turned(parseFloat(moved["rotate"] ?? "0") * progress));
  matrix = times(matrix, scaled(1 + (parseFloat(sx) - 1) * progress, 1 + (parseFloat(sy) - 1) * progress));
  matrix = times(matrix, listMatrix(moved["transform"] ?? "", progress));
  return times(matrix, shifted(-origin[0], -origin[1]));
}

const decoded = new Map<string, Promise<HTMLImageElement>>();
const decode = (src: string) => {
  let image = decoded.get(src);
  if (!image) {
    const element = new Image();
    element.src = src;
    image = element.decode().then(() => element);
    decoded.set(src, image);
  }
  return image;
};

async function independentStill(moved: Record<string, string>, progress: number, shift: number) {
  const canvas = document.body.firstElementChild!.appendChild(document.createElement("canvas"));
  canvas.id = "still";
  canvas.width = Math.round(SHOWN_WIDTH * devicePixelRatio);
  canvas.height = Math.round(SHOWN_HEIGHT * devicePixelRatio);
  canvas.setAttribute("style", `display:block;flex:none;width:${SHOWN_WIDTH}px;height:${SHOWN_HEIGHT}px`);
  const context = canvas.getContext("2d")!;
  const [base, brows] = await Promise.all([decode(FILES.base), decode(FILES.brows)]);
  context.drawImage(base, 0, 0, canvas.width, canvas.height);
  const [a, b, c, d, e, f] = times(shifted(shift, 0), expectedPose(moved, progress));
  const kx = canvas.width / WIDTH;
  const ky = canvas.height / HEIGHT;
  context.setTransform(a, (b * ky) / kx, (c * kx) / ky, d, e * kx, f * ky);
  context.drawImage(brows, 0, 0, canvas.width, canvas.height);
  context.setTransform(1, 0, 0, 1, 0, 0);
  await nextFrame();
}

const show = async (moved: Record<string, string>, progress: number, options: { shift?: number; stillShift?: number } = {}) => {
  await draw(
    {
      files: FILES,
      shown: ["base", "brows"],
      moved: "brows",
      keyframes: [
        { offset: 0, lids: { state: "off" } },
        { offset: 0.5, lids: { state: "on" } },
        { offset: 1, lids: { state: "off" }, brows: moved },
      ],
      readSource: layeredMorphSource(() => CONTEXT as never),
      groups: ["lids"],
    },
    progress,
    options.shift,
  );
  await independentStill(moved, progress, options.stillShift ?? 0);
};

const showGroup = (moved: Record<string, string>, progress: number) =>
  draw(
    {
      files: GROUP_FILES,
      shown: ["base", "red", "blue"],
      moved: "face",
      keyframes: [
        { offset: 0, face: { opacity: "1" } },
        { offset: 1, face: moved },
      ],
      readSource: async () => ({ text: GROUP_ARTWORK }),
      groups: [],
    },
    progress,
  );

async function load(src: string) {
  const loaded = await browserPictureLoader(src, document);
  if (!loaded) return { accepted: false, painted: 0 };
  const canvas = document.createElement("canvas");
  canvas.width = 40;
  canvas.height = 30;
  const context = canvas.getContext("2d")!;
  context.drawImage(loaded.image, 0, 0, 40, 30);
  const pixels = context.getImageData(0, 0, 40, 30).data;
  let painted = 0;
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) painted += 1;
  return { accepted: true, painted, width: loaded.width, height: loaded.height };
}

const WHOLE_PNG = paintFile((context) => {
  context.fillStyle = "#3a6ea5";
  context.fillRect(0, 0, WIDTH, HEIGHT);
});

async function sparse(dot: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 2000;
  canvas.height = 3000;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#141414";
  if (dot > 0) context.fillRect(1001, 1503, dot, dot);
  const image = new Image();
  image.src = canvas.toDataURL("image/png");
  await image.decode();
  return paintsAnything(image, image.naturalWidth, image.naturalHeight, document);
}

const LAYER_SVG =
  `<svg xmlns="${SVG_NS}" width="100" height="100" viewBox="0 0 100 100">` +
  '<g data-name="mouth.open default"><path d="M45 35H95V85H45Z" fill="#2040e0"/></g>' +
  '<g data-name="mouth.closed"><path d="M45 35H95V85H45Z" fill="#2040e0"/></g></svg>';

const smallFile = (color: string, x: number, y: number, w: number, h: number) => {
  const canvas = document.createElement("canvas");
  canvas.width = 100;
  canvas.height = 100;
  const context = canvas.getContext("2d")!;
  context.fillStyle = color;
  context.fillRect(x, y, w, h);
  return canvas.toDataURL("image/png");
};

const SVG_LAYER_FILES = [
  smallFile("#ffffff", 0, 0, 100, 100),
  smallFile("#e02020", 20, 20, 60, 60),
  `data:image/svg+xml,${encodeURIComponent(LAYER_SVG)}`,
  smallFile("#20c040", 5, 70, 40, 20),
];

const SVG_LAYER_ARTWORK =
  `<svg xmlns="${SVG_NS}" viewBox="0 0 100 100">` +
  '<image data-name="base" data-layer="0" x="0" y="0" width="100" height="100"/>' +
  '<g data-name="outer"><g data-name="inner">' +
  '<image data-name="red" data-layer="1" x="0" y="0" width="100" height="100"/>' +
  '<image data-name="blue" data-layer="2" x="0" y="0" width="100" height="100"/></g>' +
  '<image data-name="green" data-layer="3" x="0" y="0" width="100" height="100"/></g></svg>';

const SVG_LAYER_SIBLING_ARTWORK = SVG_LAYER_ARTWORK.replace(
  '<image data-name="blue" data-layer="2" x="0" y="0" width="100" height="100"/></g>',
  '</g><image data-name="blue" data-layer="2" x="0" y="0" width="100" height="100"/>',
);

async function svgLayer(outer: Record<string, string>, inner: Record<string, string>, width: number, height: number, sibling = false) {
  const artwork = sibling ? SVG_LAYER_SIBLING_ARTWORK : SVG_LAYER_ARTWORK;
  document.body.replaceChildren();
  const holder = document.body.appendChild(document.createElement("div"));
  holder.setAttribute("style", "display:flex;gap:20px;padding:10px;background:#fff");
  const timing = { duration: 1, delay: 0, easing: "linear", iterations: 1, direction: "normal" } as const;
  const chomp = serializeMorphRecipe(buildMorphRecipe("chomp", { blend: "cut", keyframes: [{ offset: 0, mouth: { state: "open" } }, { offset: 1, mouth: { state: "closed" } }] } as never));
  const keyframes = [
    { offset: 0, outer: { translate: "0px", opacity: "100%" }, inner: { translate: "0px", opacity: "100%" } },
    { offset: 1, outer, inner },
  ];
  const motion = buildMorphMotion(keyframes)!;
  const recipe = serializeMorphRecipe(buildMorphRecipe("shift", { blend: "cut", keyframes } as never));
  for (const live of [false, true]) {
    const overlay = holder.appendChild(document.createElement("div"));
    const span = overlay.appendChild(document.createElement("span"));
    span.id = live ? "live" : "canvas";
    const background = [...SVG_LAYER_FILES].reverse().map((src) => `url("${src}")`).join(", ");
    span.setAttribute(
      "style",
      `display:block;position:relative;width:200px;height:200px;background-image:${background};background-size:100% 100%;background-repeat:no-repeat`,
    );
    const host = createMorphHost({
      service: new MorphBakeService(),
      channel: () => ({ recipes: { shift: recipe, chomp }, variants: {} }),
      readSource: async (ref) => ({ text: ref.key === "inner" ? LAYER_SVG : artwork }),
    });
    const playback = new MorphPlayback(overlay, { host, seed: "s", requestFrame: () => 0, cancelFrame: () => {} });
    playback.mount(
      span,
      {
        plays: [
          {
            layer: 0,
            picture: {
              span: SVG_LAYER_FILES.length,
              files: SVG_LAYER_FILES.map((src, index) => ({
                src,
                name: `${index}.${index === 2 ? "svg" : "png"}`,
                ...(live && index === 2
                  ? { plays: [{ ref: { morphs: ["chomp"], key: "inner", image: "blue", selection: "{}", groups: ["mouth"] }, morph: "chomp", timing, definition: "c" }] }
                  : {}),
              })),
            },
            ref: { morphs: ["shift"], key: "picture", image: "kit", selection: "{}", groups: [] },
            morph: "shift",
            timing,
            motion,
            definition: "s",
          },
        ],
        epoch: 0,
      },
      background,
      "background",
      "portrait:0",
    );
    const shadow = () => span.querySelector("span.morph")?.shadowRoot;
    await until(() => !!shadow()?.querySelector("canvas") && (!live || !!shadow()?.querySelector("[data-morph]")));
    span.style.setProperty("width", `${width}px`);
    span.style.setProperty("height", `${height}px`);
    playback.requestRelayout();
    await nextFrame();
    playback.advance(1);
    await nextFrame();
    if (width !== 200 || height !== 200) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      await until(() => [...(shadow()?.querySelectorAll("canvas") ?? [])].every((canvas) => Math.abs(canvas.width / canvas.height - width / height) < 0.02));
      await new Promise((resolve) => setTimeout(resolve, 100));
      playback.advance(1);
      await nextFrame();
    }
  }
  const reference = holder.appendChild(document.createElementNS(SVG_NS, "svg"));
  reference.id = "reference";
  reference.setAttribute("width", String(width));
  reference.setAttribute("height", String(height));
  reference.setAttribute("viewBox", "0 0 100 100");
  reference.setAttribute("preserveAspectRatio", "none");
  reference.setAttribute("style", "display:block;flex:none;overflow:hidden;margin-top:0");
  const image = (parent: Element, index: number) => {
    const element = parent.appendChild(document.createElementNS(SVG_NS, "image"));
    element.setAttribute("href", SVG_LAYER_FILES[index]!);
    element.setAttribute("width", "100");
    element.setAttribute("height", "100");
  };
  const group = (parent: Element, label: string) => {
    const element = parent.appendChild(document.createElementNS(SVG_NS, "g"));
    element.setAttribute("style", "transform-box:view-box;transform-origin:50% 50%");
    const animation = element.animate(morphMotionKeyframes(motion[label]!) as Keyframe[], { duration: 1000, fill: "both" });
    animation.pause();
    animation.currentTime = 1000;
    return element;
  };
  image(reference, 0);
  const outerGroup = group(reference, "outer");
  const innerGroup = group(outerGroup, "inner");
  image(innerGroup, 1);
  image(sibling ? outerGroup : innerGroup, 2);
  image(outerGroup, 3);
  await nextFrame();
}

const FIT_SVGS: Record<string, string> = {
  "a viewBox of another shape": `<svg xmlns="${SVG_NS}" width="100" height="100" viewBox="0 0 200 100"><rect x="10" y="20" width="70" height="50" fill="#2040e0"/></svg>`,
  "no viewBox": `<svg xmlns="${SVG_NS}" width="100" height="100"><rect x="10" y="20" width="70" height="50" fill="#2040e0"/></svg>`,
  "an alignment and slice": `<svg xmlns="${SVG_NS}" width="100" height="100" viewBox="0 0 100 50" preserveAspectRatio="xMaxYMin slice"><rect x="10" y="10" width="70" height="30" fill="#2040e0"/></svg>`,
  "a size set by its own style": `<svg xmlns="${SVG_NS}" width="100" height="100" viewBox="0 0 100 100" style="width:100px;height:100px"><rect x="10" y="20" width="70" height="50" fill="#2040e0"/></svg>`,
  "a size set by a stylesheet": `<svg xmlns="${SVG_NS}" width="100" height="100" viewBox="0 0 100 100"><style>svg { width: 100px; height: 100px }</style><rect x="10" y="20" width="70" height="50" fill="#2040e0"/></svg>`,
};

const styledFit = (style: string) =>
  `<svg xmlns="${SVG_NS}" width="100" height="100" viewBox="0 0 100 100" style="${style}"><rect x="10" y="20" width="70" height="50"/><path d="M15 85 L85 85 L50 95 Z" stroke-width="3"/></svg>`;

async function cssFit(kind: string, width: number, height: number) {
  document.body.replaceChildren();
  const holder = document.body.appendChild(document.createElement("div"));
  holder.setAttribute("style", "display:flex;gap:20px;padding:10px;background:#fff");
  const file = FIT_SVGS[kind] ?? styledFit(kind);
  const files = [smallFile("#ffffff", 0, 0, 100, 100), `data:image/svg+xml,${encodeURIComponent(file)}`];
  const background = [...files].reverse().map((src) => `url("${src}")`).join(", ");
  const style = `display:block;position:relative;width:${width}px;height:${height}px;background-image:${background};background-size:100% 100%;background-repeat:no-repeat`;
  const overlay = holder.appendChild(document.createElement("div"));
  const ours = overlay.appendChild(document.createElement("span"));
  ours.id = "ours";
  ours.setAttribute("style", style);
  const css = holder.appendChild(document.createElement("div"));
  css.id = "css";
  css.setAttribute("style", style);
  const artwork =
    `<svg xmlns="${SVG_NS}" viewBox="0 0 100 100">` +
    '<image data-name="base" data-layer="0" x="0" y="0" width="100" height="100"/>' +
    '<image data-name="mark" data-layer="1" x="0" y="0" width="100" height="100"/></svg>';
  const keyframes = [
    { offset: 0, mark: { translate: "0px" } },
    { offset: 1, mark: { translate: "0px" } },
  ];
  const recipe = serializeMorphRecipe(buildMorphRecipe("hold", { blend: "cut", keyframes } as never));
  const host = createMorphHost({
    service: new MorphBakeService(),
    channel: () => ({ recipes: { hold: recipe }, variants: {} }),
    readSource: async () => ({ text: artwork }),
  });
  const playback = new MorphPlayback(overlay, { host, seed: "s", requestFrame: () => 0, cancelFrame: () => {} });
  playback.mount(
    ours,
    {
      plays: [
        {
          layer: 0,
          picture: { span: 2, files: files.map((src, index) => ({ src, name: `${index}` })) },
          ref: { morphs: ["hold"], key: "fit", image: "kit", selection: "{}", groups: [] },
          morph: "hold",
          timing: { duration: 1, delay: 0, easing: "linear", iterations: 1, direction: "normal" },
          motion: buildMorphMotion(keyframes)!,
          definition: "h",
        },
      ],
      epoch: 0,
    },
    background,
    "background",
    "portrait:0",
  );
  await until(() => !!ours.querySelector("span.morph")?.shadowRoot?.querySelector("canvas"));
  playback.advance(0.5);
  await nextFrame();
}

const svgVerdict = (text: string, natural?: { width: number; height: number }) => {
  const verdict = readSvgLayer(text, new DOMParser(), { view: window, ...(natural ? { natural } : {}) });
  return "source" in verdict ? "kept" : verdict.reason === "styled" ? `styled:${verdict.declaration}` : verdict.reason;
};

const svgRaster = async (text: string, width: number, height: number) => {
  const verdict = readSvgLayer(text, new DOMParser(), { view: window });
  if (!("source" in verdict)) return verdict.reason;
  const raster = await browserSvgLayerRasterizer(verdict.source, { width: 100, height: 100 }, width, height, document);
  raster?.release();
  return raster ? "rasterized" : "refused";
};

(window as unknown as { layeredMotion: unknown }).layeredMotion = { show, showGroup, load, sparse, svgLayer, cssFit, svgVerdict, svgRaster, wholePng: WHOLE_PNG };
