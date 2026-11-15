import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

const PAGE_STYLE = `
body { margin: 0; padding: 16px; background: #ffffff; color: #111111; }
section { width: 420px; container-type: inline-size; margin-bottom: 24px; }
`;

export const buildScreenplayHangPage = async (outDir) => {
  mkdirSync(outDir, { recursive: true });
  await build({
    entryPoints: [join(here, "screenplay-hang.ts")],
    bundle: true,
    format: "iife",
    outfile: join(outDir, "screenplay-hang.js"),
    conditions: ["development"],
    loader: { ".json": "json" },
    logLevel: "silent",
  });
  const previewCss = readFileSync(
    resolve(here, "../../src/modules/screenplay-preview/sparkdown-screenplay-preview.css"),
    "utf8",
  );
  const fontUrl = pathToFileURL(resolve(here, "../../../../impower-dev/src/public/fonts/courier-prime.ttf")).href;
  const fontFace = `@font-face { font-family: "Courier Prime"; src: url("${fontUrl}"); }`;
  const page = join(outDir, "screenplay-hang.html");
  writeFileSync(
    page,
    `<!doctype html><meta charset="utf-8"><title>Screenplay hang</title><style>${fontFace}</style><style>${previewCss}</style><style>${PAGE_STYLE}</style><body><script src="screenplay-hang.js"></script></body>`,
  );
  return pathToFileURL(page).href;
};
