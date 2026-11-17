import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

const PAGE_STYLE = `
:root { color-scheme: dark; --ink: #e6e6e6; --muted: #8a8f98; --accent: #4ea1ff; --editor-breakpoint: #e5484d; --editor-problem-error: #e5484d; --editor-problem-warning: #f5a524; --editor-problem-info: #4ea1ff; --editor-icon-close: #c0c4cc; --editor-icon-ink: #e6e6e6; --radius-sm: 4px; }
:root { --syntax-bool: hsl(0 70% 65%); --syntax-bracket: hsl(18 70% 65%); --syntax-builtin: hsl(36 70% 65%); --syntax-class-name: hsl(54 70% 65%); --syntax-constant-variable-name: hsl(72 70% 65%); --syntax-function-name: hsl(90 70% 65%); --syntax-module-keyword: hsl(108 70% 65%); --syntax-number: hsl(126 70% 65%); --syntax-operator: hsl(144 70% 65%); --syntax-parameter-name: hsl(162 70% 65%); --syntax-plain-keyword: hsl(180 70% 65%); --syntax-property-name: hsl(198 70% 65%); --syntax-section-name-accessor: hsl(216 70% 65%); --syntax-section-name-definition: hsl(234 70% 65%); --syntax-standard-function: hsl(252 70% 65%); --syntax-standard-type: hsl(270 70% 65%); --syntax-string: hsl(288 70% 65%); --syntax-text: hsl(306 70% 65%); --syntax-type-name: hsl(324 70% 65%); --syntax-variable-name: hsl(342 70% 65%); }
body { margin: 0; padding: 16px; background: #1e1f22; color: var(--ink); font: 16px/1.5 monospace; }
section { position: relative; width: 400px; height: 520px; }
section .cm-editor { height: 100%; }
`;

export const buildIconMaskPaintPage = async (outDir) => {
  mkdirSync(outDir, { recursive: true });
  await build({
    entryPoints: [join(here, "icon-mask-paint.ts")],
    bundle: true,
    format: "iife",
    outfile: join(outDir, "icon-mask-paint.js"),
    conditions: ["development"],
    jsx: "automatic",
    jsxImportSource: "preact",
    alias: { react: "preact/compat", "react-dom": "preact/compat" },
    logLevel: "silent",
  });
  const impowerUi = readFileSync(resolve(here, "../../../impower-ui/src/style.css"), "utf8");
  const editorCss = readFileSync(
    resolve(here, "../../src/modules/script-editor/sparkdown-script-editor.css"),
    "utf8",
  );
  const page = join(outDir, "icon-mask-paint.html");
  writeFileSync(
    page,
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Icon mask paint</title><style>${impowerUi}</style><style>${editorCss}</style><style>${PAGE_STYLE}</style><body><script src="icon-mask-paint.js"></script></body>`,
  );
  return pathToFileURL(page).href;
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outDir = process.argv[2];
  if (!outDir) {
    console.error("usage: node icon-mask-paint.mjs <output-directory>");
    process.exit(1);
  }
  console.log(await buildIconMaskPaintPage(resolve(outDir)));
}
