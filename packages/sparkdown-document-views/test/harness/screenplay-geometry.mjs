import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

const PAGE_STYLE = `
body { margin: 0; padding: 16px; background: #ffffff; color: #111111; }
section { container-type: inline-size; margin-bottom: 24px; --sp-muted: #666666; }
`;

export const EMOJI_FONT_URL = "https://fonts.invalid/noto-color-emoji.ttf";

const FACES = [
  ["courier-prime.ttf", "normal", "normal"],
  ["courier-prime-bold.ttf", "bold", "normal"],
  ["courier-prime-italic.ttf", "normal", "italic"],
  ["courier-prime-bold-italic.ttf", "bold", "italic"],
];

export const buildScreenplayGeometryPage = async (outDir) => {
  mkdirSync(outDir, { recursive: true });
  await build({
    entryPoints: [join(here, "screenplay-geometry.ts")],
    bundle: true,
    format: "iife",
    outfile: join(outDir, "screenplay-geometry.js"),
    conditions: ["development"],
    loader: { ".json": "json" },
    logLevel: "silent",
  });
  const previewCss = readFileSync(
    resolve(here, "../../src/modules/screenplay-preview/sparkdown-screenplay-preview.css"),
    "utf8",
  );
  const fontFaces = FACES.map(([file, weight, style]) => {
    const data = readFileSync(resolve(here, "../../../../impower-dev/src/public/fonts", file)).toString("base64");
    return `@font-face { font-family: "Courier Prime"; src: url("data:font/ttf;base64,${data}") format("truetype"); font-weight: ${weight}; font-style: ${style}; }`;
  }).join("\n");
  const emojiFace = `@font-face { font-family: "Noto Color Emoji"; src: url("${EMOJI_FONT_URL}") format("truetype"); }`;
  const page = join(outDir, "screenplay-geometry.html");
  writeFileSync(
    page,
    `<!doctype html><meta charset="utf-8"><title>Screenplay geometry</title><style>${fontFaces}
${emojiFace}</style><style>${previewCss}</style><style>${PAGE_STYLE}</style><body><script src="screenplay-geometry.js"></script></body>`,
  );
  return pathToFileURL(page).href;
};
