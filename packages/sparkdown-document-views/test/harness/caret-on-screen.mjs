import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

const PAGE_STYLE = `
:root { color-scheme: dark; --ink: #e6e6e6; --muted: #8a8f98; --accent: #4ea1ff; }
html, body { margin: 0; height: 100%; }
body { display: flex; flex-direction: column; background: #1e1f22; color: var(--ink); font: 16px/1.5 monospace; }
section { flex: 1; min-height: 0; display: flex; }
section .cm-editor { flex: 1; min-height: 0; }
`;

export const buildCaretOnScreenPage = async (outDir) => {
  mkdirSync(outDir, { recursive: true });
  await build({
    entryPoints: [join(here, "caret-on-screen.ts")],
    bundle: true,
    format: "iife",
    outfile: join(outDir, "caret-on-screen.js"),
    conditions: ["development"],
    jsx: "automatic",
    jsxImportSource: "preact",
    alias: { react: "preact/compat", "react-dom": "preact/compat" },
    logLevel: "silent",
  });
  const editorCss = readFileSync(
    resolve(here, "../../src/modules/script-editor/sparkdown-script-editor.css"),
    "utf8",
  );
  const page = join(outDir, "caret-on-screen.html");
  writeFileSync(
    page,
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Caret on screen</title><style>${editorCss}</style><style>${PAGE_STYLE}</style><body><script src="caret-on-screen.js"></script></body>`,
  );
  return pathToFileURL(page).href;
};
