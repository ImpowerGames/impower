// ----------------------------------------------------------------------------
// Vite configuration & plugins for impower-dev.
//
// This module owns the Vite-native surface: path constants, dependency
// resolution (alias/dedupe), build-time env defines, and the custom plugins
// (asset loaders, the SSG page renderer, and dev worker hot-reload). build.ts
// imports these and orchestrates the multi-target build (API / pages /
// components / workers) and the fastify-mounted dev server — work that doesn't
// fit Vite's single-config / static-index.html model.
// ----------------------------------------------------------------------------

import { execSync, spawn } from "child_process";
import * as chokidar from "chokidar";
import * as dotenv from "dotenv";
import fs from "fs";
import { createRequire } from "module";
import path from "path";
import glob from "tiny-glob";
import { build, defineConfig, Plugin } from "vite";
import pkg from "./package.json";
import { ComponentSpec } from "./src/build/ComponentSpec.js";
import getScopedCSS from "./src/build/getScopedCSS.js";
import staticallyRenderPage from "./src/build/staticallyRenderPage.js";

const indir = "src";
const outdir = "out";

const workersInDir = `${indir}/workers`;

const serviceWorkerPaths = [`${workersInDir}/sw.ts`];

const externalWorkerPaths = [
  `../packages/sparkdown-language-server/src/sparkdown-language-server.ts`,
  `../packages/sparkdown-screenplay-pdf/src/sparkdown-screenplay-pdf.ts`,
  `../packages/opfs-workspace/src/opfs-workspace.ts`,
];

const apiInDir = `${indir}/api`;
const apiOutDir = `${outdir}/api`;
const componentsInDir = `${indir}/components`;
const componentsOutDir = `${outdir}/components`;
const publicInDir = `${indir}/public`;
const publicOutDir = `${outdir}/public`;
const pagesInDir = `${indir}/pages`;

// Packages that publish subpath exports via the package.json `exports` map
// (e.g. `preact/jsx-dev-runtime`, `preact/hooks`). Vite's object-form alias
// does prefix replacement and skips the exports map, so subpaths fail to
// resolve. Instead of aliasing these, list them in `dedupe` — Node-style
// resolution still finds them in the local node_modules while ensuring a
// single instance is used across the workspace.
const DEDUPE_ONLY = new Set(["preact", "preact-custom-element"]);

// Resolve a dependency via Node's module resolver rather than a hardcoded
// `cwd/node_modules/...` path, so it works whether the dep lives in this
// package's node_modules OR is hoisted to a workspace-root node_modules.
const require = createRequire(import.meta.url);
const resolvePkgDir = (name: string): string => {
  const segs = name.split("/");
  // 1) Preferred: resolve the package's own package.json. Works for packages
  // that expose `./package.json` (or have no `exports` map at all).
  try {
    return path.dirname(
      require.resolve(`${name}/package.json`, { paths: [process.cwd()] }),
    );
  } catch {
    // fall through
  }
  // 2) Resolve the package entry — which honors the `exports` map — then slice
  // the path back to the `node_modules/<name>` root (e.g. @codemirror/*, which
  // omit `./package.json` from `exports` but DO export a main entry).
  try {
    const entry = require.resolve(name, { paths: [process.cwd()] });
    const marker = path.join("node_modules", ...segs);
    const idx = entry.lastIndexOf(marker);
    if (idx >= 0) {
      return entry.slice(0, idx + marker.length);
    }
  } catch {
    // fall through
  }
  // 3) Exports-independent: walk up the node_modules chain from cwd looking for
  // the package directory. Needed for packages whose `exports` map exposes
  // neither `./package.json` NOR a main entry (e.g. @impower/impower-ui, which
  // only publishes subpath exports). This is the only branch that's robust to
  // workspace hoisting AND restrictive exports maps — a hardcoded
  // `cwd/node_modules/<name>` breaks the moment the dep is hoisted to root.
  let cur = process.cwd();
  for (;;) {
    const dir = path.join(cur, "node_modules", ...segs);
    if (fs.existsSync(dir)) {
      return dir;
    }
    const parent = path.dirname(cur);
    if (parent === cur) {
      break;
    }
    cur = parent;
  }
  return path.resolve(process.cwd(), "node_modules", name);
};

const alias: Record<string, string> = {};
const dedupe: string[] = [];
for (const depName of Object.keys(pkg.peerDependencies || {})) {
  if (DEDUPE_ONLY.has(depName)) {
    dedupe.push(depName);
  } else {
    alias[depName] = resolvePkgDir(depName);
  }
}

// react → preact/compat. @preact/preset-vite injects this for the browser
// pipeline but not for ssrLoadModule, which means Radix UI / react-resizable
// -panels resolve to the real React installed transitively under
// packages/impower-ui — and preact-render-to-string can't drive React's
// hook dispatcher. Force the alias here so SSR uses Preact's compat layer
// the same way the browser does.
const preactCompat = require.resolve("preact/compat", {
  paths: [process.cwd()],
});
alias["react"] = preactCompat;
alias["react-dom"] = preactCompat;

// impower-ui's Tailwind entry stylesheet — the SSG runs it through Vite's
// `?direct` pipeline to inline the editor's utilities. Resolved hoist-robustly
// (the file is reached via the package dir, not its `exports` map).
const impowerUiStyleCss = path.join(
  resolvePkgDir("@impower/impower-ui"),
  "src/style.css",
);

const PRODUCTION = process.argv.includes("--production");
const WATCH = process.argv.includes("--watch");
const MINIFY = process.argv.includes("--minify");

// Env Setup
const envPrefix = PRODUCTION ? ".env.production" : ".env.development";
const envFiles = fs
  .readdirSync(process.cwd())
  .filter((f) => f.startsWith(envPrefix))
  .sort();
for (const file of envFiles) {
  dotenv.config({ path: path.join(process.cwd(), file), override: false });
}

const BROWSER_VARIABLES_ENV: Record<string, string> = {};
Object.entries(process.env).forEach(([key, value]) => {
  if (value && (key.startsWith("BROWSER_") || key.startsWith("VITE_"))) {
    BROWSER_VARIABLES_ENV[key] = value;
  }
});

const PATH_RESOLUTION_BANNER = `
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
process.env.NODE_ENV = process.env.NODE_ENV || '${PRODUCTION ? "production" : "development"}';
`.trim();

const PROCESS_ENV_BANNER_JS = `
var process = { env: ${JSON.stringify(BROWSER_VARIABLES_ENV)} };
import.meta.env = ${JSON.stringify(BROWSER_VARIABLES_ENV)};
`.trim();

const getServiceWorkerProcessEnvBanner = (options?: {
  swVersion?: string | number;
  swResources?: string[];
}) =>
  `
var process = {
  env: {
    NODE_ENV: '${PRODUCTION ? "production" : "development"}',
    SW_VERSION: ${options?.swVersion ? `'${options.swVersion}'` : "undefined"},
    SW_CACHE_NAME: ${options?.swVersion ? `'cache-${options.swVersion}'` : "undefined"},
    SW_RESOURCES: ${options?.swResources ? `'${JSON.stringify(options.swResources)}'` : "undefined"},
  }
};
`.trim();

// ----------------------------------------------------------------------------
// Shared Utilities
// ----------------------------------------------------------------------------

const staticallyStylePage = (html: string, ssg: string) => {
  return html.replace(
    "</head>",
    `<style id="ssg-css">${ssg}\nhtml{opacity:1;}</style>\n</head>`,
  );
};

// ----------------------------------------------------------------------------
// Vite Plugins
// ----------------------------------------------------------------------------

const viteDefineProcessPlugin = (): Plugin => ({
  name: "vite-define-process",
  apply: "serve",
  transform(code, id) {
    if (
      /\.(ts|js|mjs)$/.test(id) &&
      !id.includes("node_modules") &&
      !id.includes(apiInDir)
    ) {
      return { code: PROCESS_ENV_BANNER_JS + "\n" + code, map: null };
    }
  },
});

// Cache: file path → true if it's a Tailwind entry (contains @import "tailwindcss").
// Such files must NOT be wrapped as `export default "..."` — they need Vite's
// normal CSS pipeline (with @tailwindcss/vite) so utility classes are
// generated. Component-local .css files are still wrapped for string injection.
const tailwindEntryCache = new Map<string, boolean>();
const isTailwindEntry = async (file: string): Promise<boolean> => {
  if (tailwindEntryCache.has(file)) return tailwindEntryCache.get(file)!;
  try {
    const content = await fs.promises.readFile(file, "utf-8");
    const hit = /@import\s+["']tailwindcss["']|@tailwind\s/.test(content);
    tailwindEntryCache.set(file, hit);
    return hit;
  } catch {
    tailwindEntryCache.set(file, false);
    return false;
  }
};

const viteLoadersPlugin = (): Plugin => ({
  name: "vite-custom-loaders",
  enforce: "pre",
  async resolveId(source, importer) {
    if (/\.(html|css|svg|txt|csv)$/.test(source) && !source.includes("?")) {
      const res = await this.resolve(source, importer, { skipSelf: true });
      if (res) {
        if (source.endsWith(".css") && (await isTailwindEntry(res.id))) {
          return null;
        }
        return `${res.id}?raw`;
      }
    }
    return null;
  },
  async load(id) {
    if (id.includes("\0")) return;
    const file = id.split("?")[0];
    if (/\.(html|css|svg|txt|csv)$/.test(file)) {
      if (file.endsWith(".css") && (await isTailwindEntry(file))) {
        return;
      }
      const content = await fs.promises.readFile(file, "utf-8");
      return `export default ${JSON.stringify(content)};`;
    }
    if (/\.(ttf|woff2)$/.test(file)) {
      const buffer = await fs.promises.readFile(file);
      return `export default new Uint8Array([${Array.from(buffer).join(",")}]);`;
    }
  },
});

const viteBannerPlugin = (banner: string): Plugin => ({
  name: "vite-banner-plugin",
  renderChunk(code, chunk) {
    if (chunk.fileName.endsWith(".js")) return banner + "\n" + code;
    return null;
  },
});

const viteStaticallyRenderedPagesPlugin = (): Plugin => ({
  name: "vite-statically-rendered-pages",
  configureServer(server) {
    const outDevDir = path.resolve(process.cwd(), outdir, ".dev");
    fs.mkdirSync(outDevDir, { recursive: true });

    // --- Worker hot-reload ---------------------------------------------------
    // External workers (`new Worker("/x.js")`) live in sibling packages and are
    // bundled by their own esbuild.js, so they sit OUTSIDE Vite's module graph —
    // editing them (or their transitively-bundled engine/compiler deps) used to
    // require a full dev-server restart. Instead, run each worker's esbuild in
    // --watch mode: it rebuilds incrementally into outDevDir on any input
    // change, and a watcher on those outputs triggers a full page reload, which
    // re-instantiates the Worker with the fresh bundle.
    const workerProcs: ReturnType<typeof spawn>[] = [];
    for (const wp of externalWorkerPaths) {
      const pkgRoot = wp.substring(0, wp.indexOf("/src/"));
      const esbuildScript = path.resolve(process.cwd(), pkgRoot, "esbuild.js");
      if (fs.existsSync(esbuildScript)) {
        workerProcs.push(
          spawn("node", ["esbuild.js", `--outdir=${outDevDir}`, "--watch"], {
            cwd: path.dirname(esbuildScript),
            stdio: "ignore",
          }),
        );
      }
    }
    const killWorkerProcs = () => {
      for (const p of workerProcs) {
        try {
          p.kill();
        } catch {
          /* already gone */
        }
      }
    };
    server.httpServer?.once("close", killWorkerProcs);
    process.once("exit", killWorkerProcs);

    // Reload the page when a rebuilt worker bundle (or the SW source) changes.
    // Suppress the burst of events from the watch processes' initial builds so
    // the freshly-loaded page isn't immediately reloaded on startup.
    let acceptReloads = false;
    setTimeout(() => {
      acceptReloads = true;
    }, 3000);
    let reloadTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleReload = () => {
      if (!acceptReloads) return;
      // Coalesce the burst of fs events a single esbuild rebuild emits (it
      // rewrites the bundle + sourcemap, sometimes in multiple passes) into one
      // page reload.
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => server.ws.send({ type: "full-reload" }), 400);
    };
    chokidar
      .watch(outDevDir, { ignoreInitial: true })
      .on("add", (f) => /\.js$/.test(f) && scheduleReload())
      .on("change", (f) => /\.js$/.test(f) && scheduleReload());
    chokidar
      .watch(
        serviceWorkerPaths.map((p) => path.resolve(process.cwd(), p)),
        { ignoreInitial: true },
      )
      .on("change", scheduleReload);

    // Inject custom middleware into Vite's dev server
    server.middlewares.use(async (req, res, next) => {
      try {
        if (req.method !== "GET" || !req.url) return next();

        const url = req.url.split("?")[0];

        const requestedWorkerPath = [
          ...externalWorkerPaths,
          ...serviceWorkerPaths,
        ].find(
          (p) =>
            url === `/${path.basename(p, path.extname(p))}.js` ||
            url === `/${path.basename(p, path.extname(p))}.js.map`,
        );

        if (requestedWorkerPath) {
          const name = path.basename(
            requestedWorkerPath,
            path.extname(requestedWorkerPath),
          );
          const isMap = url.endsWith(".map");
          const isExternal = externalWorkerPaths.includes(requestedWorkerPath);
          const workerPkgRoot = isExternal
            ? requestedWorkerPath.substring(
                0,
                requestedWorkerPath.indexOf("/src/"),
              )
            : "";
          const workerEsbuildScriptPath = isExternal
            ? path.resolve(process.cwd(), workerPkgRoot, "esbuild.js")
            : "";

          if (isExternal && fs.existsSync(workerEsbuildScriptPath)) {
            const filePath = path.join(
              outDevDir,
              isMap ? `${name}.js.map` : `${name}.js`,
            );
            // The --watch esbuild process (started in configureServer) keeps
            // this file fresh. On a cold first request it may not exist yet,
            // so fall back to a one-shot build.
            if (!fs.existsSync(filePath) && !isMap) {
              execSync(`node esbuild.js --outdir=${outDevDir}`, {
                cwd: path.dirname(workerEsbuildScriptPath),
                stdio: "ignore",
              });
            }
            if (fs.existsSync(filePath)) {
              res.statusCode = 200;
              res.setHeader(
                "Content-Type",
                isMap ? "application/json" : "application/javascript",
              );
              // Never cache the worker bundle in dev, so a full-reload after a
              // rebuild always re-fetches the latest code.
              res.setHeader("Cache-Control", "no-store");
              res.end(fs.readFileSync(filePath, "utf-8"));
              return;
            }
          } else if (!isMap) {
            const SW_VERSION = Date.now();
            const swResourceSet = new Set(["/"]);
            // outDevDir is only created in the isExternal branch above. For
            // non-external service-worker requests it may not exist yet —
            // ensure it does so the glob doesn't ENOENT on scandir.
            if (!fs.existsSync(outDevDir)) {
              fs.mkdirSync(outDevDir, { recursive: true });
            }
            const publicFilePaths = await glob(
              `${publicInDir}/**/*.{css,html,js,mjs,ico,svg,png,ttf,woff,woff2}`,
            );
            const devFilePaths = await glob(
              `${outDevDir}/**/*.{css,html,js,mjs,ico,svg,png,ttf,woff,woff2}`,
            );
            for (const p of publicFilePaths
              .map((p) => p.replace(/\\/g, "/").replace(publicInDir, ""))
              .filter((p) => !p.endsWith(".webmanifest"))) {
              swResourceSet.add(p);
            }
            for (const p of devFilePaths
              .map((p) => p.replace(/\\/g, "/").replace(outDevDir, ""))
              .filter((p) => !p.endsWith(".webmanifest"))) {
              swResourceSet.add(p);
            }
            const SW_RESOURCES = Array.from(swResourceSet);
            console.log("");
            const result = await build({
              configFile: false,
              plugins: [
                viteBannerPlugin(
                  getServiceWorkerProcessEnvBanner({
                    swVersion: SW_VERSION,
                    swResources: SW_RESOURCES,
                  }),
                ),
              ],
              build: {
                write: false,
                rollupOptions: {
                  input: path.resolve(process.cwd(), requestedWorkerPath),
                  output: { format: "es" },
                },
              },
            });
            // @ts-ignore
            res.setHeader("Content-Type", "application/javascript");
            res.end(
              Array.isArray(result)
                ? result[0].output[0].code
                : "output" in result
                  ? result.output[0].code
                  : "",
            );
            return;
          }
        }

        // Skip file requests (assets, js, css, etc.)
        if (url.includes(".")) return next();

        const route =
          url === "/" ? "index" : url.replace(/^\//, "").replace(".html", "");
        const possibleHtmlPath = path.join(
          process.cwd(),
          "src",
          "pages",
          `${route}.html`,
        );

        // html file doesn't exist for this route
        if (!fs.existsSync(possibleHtmlPath)) return next();

        // Load the impower-dev page-root component on the server so we can
        // pre-render <div id="root"> into static HTML before JS runs.
        // ssrLoadModule means edits to it HMR like everything else.
        const preactRegistryModule = await server.ssrLoadModule(
          `/src/modules/spark-editor/preact-registry.ts`,
        );
        const rootComponent = preactRegistryModule.rootComponent;

        // Pull impower-ui's Tailwind output as raw CSS via Vite's CSS
        // pipeline (with `?direct` we get the compiled stylesheet, not the
        // JS module wrapper that injects a <style> at runtime). Inlining
        // this into the SSG <style> block means utility classes work before
        // any JS runs — without it, Preact-rendered tags would ship with
        // their Tailwind classes but no CSS to resolve them, leaving the
        // page unstyled until module imports completed.
        let impowerUiTailwindCss = "";
        try {
          const tw = await server.transformRequest(
            "/@fs/" + impowerUiStyleCss.replace(/\\/g, "/") + "?direct",
          );
          if (tw?.code) impowerUiTailwindCss = tw.code;
        } catch (err) {
          console.warn(
            "[ssg] Failed to inline impower-ui Tailwind CSS:",
            err instanceof Error ? err.message : err,
          );
        }

        const componentPaths = await glob(
          `${componentsInDir}/**/*.{js,mjs,ts}`,
        );
        const scopedCssSet = new Set<string>();
        for (const cp of componentPaths) {
          const module = await server.ssrLoadModule(
            `/${cp.replace(/\\/g, "/")}`,
          );
          const specs = Array.isArray(module.default)
            ? module.default
            : [module.default];
          specs.forEach((s: ComponentSpec) => {
            if (s.css) {
              scopedCssSet.add(
                s.html && s.tag ? getScopedCSS(s.css, s.tag) : s.css,
              );
            }
          });
        }

        const cssPath = fs.existsSync(
          path.join(process.cwd(), `${pagesInDir}/${route}.css`),
        )
          ? `/${pagesInDir}/${route}.css`
          : "";

        const mjsPath = fs.existsSync(
          path.join(process.cwd(), `${pagesInDir}/${route}.ts`),
        )
          ? `/${pagesInDir}/${route}.ts`
          : fs.existsSync(path.join(process.cwd(), `${pagesInDir}/${route}.js`))
            ? `/${pagesInDir}/${route}.js`
            : "";

        const documentHtml = fs.readFileSync(
          path.join(process.cwd(), "src", "public", "document.html"),
          "utf-8",
        );

        const html = await fs.promises
          .readFile(possibleHtmlPath, "utf-8")
          .catch(() => "");

        let renderedHtml = staticallyRenderPage(
          documentHtml,
          { html, cssPath, mjsPath },
          rootComponent,
        );

        renderedHtml = await server.transformIndexHtml(req.url, renderedHtml);

        const styledHtml = staticallyStylePage(
          renderedHtml,
          [Array.from(scopedCssSet).join("\n"), impowerUiTailwindCss]
            .filter(Boolean)
            .join("\n"),
        );

        res.setHeader("Content-Type", "text/html");
        res.end(styledHtml);
        return;
      } catch (e: any) {
        server.ssrFixStacktrace(e);
        return next(e);
      }
    });
  },
});

// ----------------------------------------------------------------------------
// Exports consumed by build.ts (the build orchestrator).
// ----------------------------------------------------------------------------

export {
  indir,
  outdir,
  apiInDir,
  apiOutDir,
  componentsInDir,
  componentsOutDir,
  publicInDir,
  publicOutDir,
  pagesInDir,
  serviceWorkerPaths,
  externalWorkerPaths,
  alias,
  dedupe,
  impowerUiStyleCss,
  PRODUCTION,
  WATCH,
  MINIFY,
  PROCESS_ENV_BANNER_JS,
  PATH_RESOLUTION_BANNER,
  getServiceWorkerProcessEnvBanner,
  staticallyStylePage,
  viteDefineProcessPlugin,
  viteLoadersPlugin,
  viteBannerPlugin,
  viteStaticallyRenderedPagesPlugin,
};

// A conventional default export: the resolve config shared by every build
// target. build.ts spreads target-specific options (ssr, inputs, outputs) on
// top of this per stage.
export default defineConfig({
  resolve: { alias, dedupe },
});
