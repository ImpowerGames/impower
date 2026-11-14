import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

const PAGE_STYLE = `
:root { color-scheme: dark; --ink: #e6e6e6; --muted: #8a8f98; --accent: #4ea1ff; --editor-breakpoint: #e5484d; --radius-sm: 4px; }
body { margin: 0; padding: 16px; background: #1e1f22; color: var(--ink); font: 16px/1.5 monospace; }
section { width: 360px; height: 320px; margin-bottom: 24px; }
`;

export const buildGutterMarksPage = async (outDir) => {
  mkdirSync(outDir, { recursive: true });
  await build({
    entryPoints: [join(here, "gutter-marks.ts")],
    bundle: true,
    format: "iife",
    outfile: join(outDir, "gutter-marks.js"),
    conditions: ["development"],
    jsx: "automatic",
    jsxImportSource: "preact",
    alias: { react: "preact/compat", "react-dom": "preact/compat" },
    logLevel: "silent",
  });
  const impowerUi = readFileSync(
    resolve(here, "../../../impower-ui/src/style.css"),
    "utf8",
  );
  const editorCss = readFileSync(
    resolve(here, "../../src/modules/script-editor/sparkdown-script-editor.css"),
    "utf8",
  );
  const routeCss = readFileSync(
    resolve(here, "../../../spark-web-player/src/route/route-list.css"),
    "utf8",
  );
  const page = join(outDir, "gutter-marks.html");
  writeFileSync(
    page,
    `<!doctype html><meta charset="utf-8"><title>Gutter marks</title><style>${impowerUi}</style><style>${editorCss}</style><style>${routeCss}</style><style>${PAGE_STYLE}</style><body><script src="gutter-marks.js"></script></body>`,
  );
  return pathToFileURL(page).href;
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outDir = process.argv[2];
  if (!outDir) {
    console.error("usage: node gutter-marks.mjs <output-directory>");
    process.exit(1);
  }
  console.log(await buildGutterMarksPage(resolve(outDir)));
}
