import { compile, optimize } from "@tailwindcss/node";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Browser, Page } from "playwright";

const SRC = resolve("../packages/impower-ui/src");

export const bundlePage = async (entry: string, workspace?: string): Promise<string> => {
  const bundle = await build({
    entryPoints: [resolve(entry)],
    bundle: true,
    write: false,
    format: "iife",
    conditions: ["development"],
    jsx: "automatic",
    jsxImportSource: "preact",
    define: { "process.env.NODE_ENV": '"test"' },
    alias: { react: "preact/compat", "react-dom": "preact/compat", "react/jsx-runtime": "preact/jsx-runtime" },
    plugins: [
      {
        name: "page-stubs",
        setup(build) {
          if (workspace) {
            build.onResolve({ filter: /(^|\/)Workspace$/ }, () => ({ path: resolve(workspace) }));
          }
          build.onResolve({ filter: /\.css$/ }, (args) => ({ path: args.path, namespace: "stylesheet" }));
          build.onLoad({ filter: /.*/, namespace: "stylesheet" }, () => ({ contents: "", loader: "js" }));
          build.onResolve({ filter: /\?raw$/ }, (args) => ({
            path: resolve(args.resolveDir, args.path.slice(0, -"?raw".length)),
            namespace: "raw",
          }));
          build.onLoad({ filter: /.*/, namespace: "raw" }, (args) => ({ contents: readFileSync(args.path, "utf8"), loader: "text" }));
        },
      },
    ],
    logLevel: "silent",
  });
  return bundle.outputFiles[0]!.text;
};

export const stylesFor = async (script: string): Promise<string> => {
  const candidates = [...script.matchAll(/"([^"\r\n]*)"|`([^`]*)`/g)].flatMap((match) => (match[1] ?? match[2]!).split(/\s+/));
  const compiler = await compile(readFileSync(join(SRC, "style.css"), "utf8"), { base: SRC, onDependency: () => {} });
  return optimize(compiler.build(candidates), { minify: false }).code;
};

export type PageSetup = {
  width: number;
  height?: number;
  touch?: boolean;
  theme?: "charcoal" | "chalk";
};

export const layoutOf = (width: number) => (width > 1100 ? "desktop" : width > 700 ? "compact" : "phone");

export const openPage = async (
  browser: Browser,
  script: string,
  css: string,
  { width, height = 900, touch = false, theme = "charcoal" }: PageSetup,
): Promise<Page> => {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
  const page = await context.newPage();
  await page.route("http://page.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html data-theme="${theme}" data-layout="${layoutOf(width)}" data-pointer="${touch ? "coarse" : "fine"}"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body style="margin:0"></body></html>`,
    }),
  );
  await page.goto("http://page.test/");
  await page.addScriptTag({ content: script });
  return page;
};

export const frames = (page: Page) =>
  page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
