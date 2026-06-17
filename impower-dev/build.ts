import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { exec, execSync } from "child_process";
import * as dotenv from "dotenv";
import fs from "fs";
import path from "path";
import glob from "tiny-glob";
import { build, createServer, Plugin } from "vite";
import pkg from "./package.json";
import { ComponentSpec } from "./src/build/ComponentSpec.js";
import getScopedCSS from "./src/build/getScopedCSS.js";
import staticallyRenderPage from "./src/build/staticallyRenderPage.js";

const RESET = "\x1b[0m";
const STRING = "%s";
const GREEN = "\x1b[32m" + STRING + RESET;
const YELLOW = "\x1b[33m" + STRING + RESET;
const BLUE = "\x1b[34m" + STRING + RESET;
const MAGENTA = "\x1b[35m" + STRING + RESET;
const CYAN = "\x1b[36m" + STRING + RESET;

const STARTED_COLOR = YELLOW;
const FINISHED_COLOR = CYAN;
const STEP_COLOR = BLUE;
const SRC_COLOR = GREEN;
const OUT_COLOR = MAGENTA;

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

const alias: Record<string, string> = {};
const dedupe: string[] = [];
for (const depName of Object.keys(pkg.peerDependencies || {})) {
  if (DEDUPE_ONLY.has(depName)) {
    dedupe.push(depName);
  } else {
    alias[depName] = path.resolve(process.cwd(), "node_modules", depName);
  }
}

// react → preact/compat. @preact/preset-vite injects this for the browser
// pipeline but not for ssrLoadModule, which means Radix UI / react-resizable
// -panels resolve to the real React installed transitively under
// packages/impower-ui — and preact-render-to-string can't drive React's
// hook dispatcher. Force the alias here so SSR uses Preact's compat layer
// the same way the browser does.
alias["react"] = path.resolve(
  process.cwd(),
  "node_modules/preact/compat/dist/compat.mjs",
);
alias["react-dom"] = path.resolve(
  process.cwd(),
  "node_modules/preact/compat/dist/compat.mjs",
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

const getRelativePath = (p: string) =>
  p.replace(process.cwd() + "\\", "").replace(/\\/g, "/");

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

const viteInlineWorkerPlugin = (): Plugin => ({
  name: "vite-inline-worker",
  enforce: "pre",
  async load(id) {
    if (id.includes("\0")) return;
    const file = id.split("?")[0];
    if (/\.worker\.(?:ts|js)$/.test(file)) {
      console.log("");
      const result = await build({
        configFile: false,
        build: {
          lib: { entry: file, formats: ["es"], fileName: "worker" },
          write: false,
          minify: MINIFY,
        },
      });
      // @ts-ignore
      let bundledText = Array.isArray(result)
        ? result[0].output[0].code
        : "output" in result
          ? result.output[0].code || ""
          : "";
      const exportIndex = bundledText.lastIndexOf("export");
      if (exportIndex >= 0) bundledText = bundledText.slice(0, exportIndex);
      return `export default ${JSON.stringify(bundledText)};`;
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

          const outDevDir = path.resolve(process.cwd(), outdir, ".dev");

          if (isExternal && fs.existsSync(workerEsbuildScriptPath)) {
            if (!fs.existsSync(outDevDir)) {
              fs.mkdirSync(outDevDir, { recursive: true });
            }
            if (!isMap) {
              execSync(`node esbuild.js --outdir=${outDevDir}`, {
                cwd: path.dirname(workerEsbuildScriptPath),
                stdio: "ignore",
              });
            }
            const filePath = path.join(
              outDevDir,
              isMap ? `${name}.js.map` : `${name}.js`,
            );
            if (fs.existsSync(filePath)) {
              res.statusCode = 200;
              res.setHeader(
                "Content-Type",
                isMap ? "application/json" : "application/javascript",
              );
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
            "/node_modules/@impower/impower-ui/src/style.css?direct",
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
// Prod Utilities
// ----------------------------------------------------------------------------

const clean = async () => {
  await fs.promises.rm(outdir, { recursive: true, force: true });
};

const copyPublic = async () => {
  console.log("");
  console.log(STEP_COLOR, "Copying Public Folder...");
  console.log(SRC_COLOR, `  ${publicInDir}`);
  console.log(OUT_COLOR, `    ⤷ ${publicOutDir}`);
  await fs.promises.mkdir(publicOutDir, { recursive: true });
  await fs.promises.cp(publicInDir, publicOutDir, { recursive: true });
};

const buildApi = async () => {
  console.log("");
  console.log(STEP_COLOR, "Building API...");
  const entryPoints = [`${apiInDir}/index.ts`];
  entryPoints.forEach((p) => {
    console.log(SRC_COLOR, `  ${getRelativePath(p)}`);
    console.log(
      OUT_COLOR,
      `    ⤷ ${getRelativePath(p).replace(indir, outdir).replace(/\.ts$/, ".js")}`,
    );
  });

  console.log("");
  await build({
    configFile: false,
    build: {
      outDir: apiOutDir,
      emptyOutDir: false,
      ssr: true,
      minify: MINIFY,
      sourcemap: !PRODUCTION,
      rollupOptions: {
        input: entryPoints,
        output: {
          format: "esm",
          entryFileNames: "[name].js",
          banner: PATH_RESOLUTION_BANNER,
        },
        external: [
          "fastify",
          "@fastify/secure-session",
          "@fastify/formbody",
          "@fastify/multipart",
          "@fastify/middie",
          "pino-pretty",
        ],
      },
    },
  });
};

const buildPages = async () => {
  console.log("");
  console.log(STEP_COLOR, "Building Pages...");
  const entryPoints = (await glob(`${pagesInDir}/**/*.{js,mjs,ts}`)).filter(
    (p) => !p.endsWith(".d.ts"),
  );

  const input: Record<string, string> = {};
  entryPoints.forEach((p) => {
    console.log(SRC_COLOR, `  ${getRelativePath(p)}`);
    console.log(
      OUT_COLOR,
      `    ⤷ ${getRelativePath(p).replace(indir, outdir).replace(/\.ts$/, ".js")}`,
    );
    const name = path.relative(pagesInDir, p).replace(/\.[^/.]+$/, "");
    input[name] = path.resolve(process.cwd(), p);
  });

  console.log("");
  await build({
    configFile: false,
    resolve: { alias, dedupe },
    plugins: [
      viteInlineWorkerPlugin(),
      viteLoadersPlugin(),
      viteDefineProcessPlugin(),
      viteBannerPlugin(PROCESS_ENV_BANNER_JS),
      tailwindcss(),
    ],
    build: {
      outDir: publicOutDir,
      emptyOutDir: false,
      minify: MINIFY,
      sourcemap: !PRODUCTION,
      rollupOptions: {
        input,
        output: {
          format: "esm",
          entryFileNames: "[name].js",
          chunkFileNames: "chunks/[name]-[hash].js",
        },
      },
    },
  });
};

const buildComponents = async () => {
  console.log("");
  console.log(STEP_COLOR, "Building Components...");
  const entryPoints = await glob(`${componentsInDir}/**/*.{js,mjs,ts}`);

  const input: Record<string, string> = {};
  entryPoints.forEach((p) => {
    console.log(SRC_COLOR, `  ${getRelativePath(p)}`);
    console.log(
      OUT_COLOR,
      `    ⤷ ${getRelativePath(p).replace(indir, outdir).replace(/\.ts$/, ".js")}`,
    );
    const name = path.relative(componentsInDir, p).replace(/\.[^/.]+$/, "");
    input[name] = path.resolve(process.cwd(), p);
  });

  console.log("");
  await build({
    configFile: false,
    resolve: { alias, dedupe },
    plugins: [viteLoadersPlugin(), tailwindcss()],
    build: {
      outDir: componentsOutDir,
      emptyOutDir: false,
      ssr: true,
      minify: MINIFY,
      sourcemap: !PRODUCTION,
      rollupOptions: {
        input,
        output: {
          format: "esm",
          entryFileNames: "[name].js",
        },
      },
    },
  });
};

const expandPageComponents = async () => {
  const htmlFilePaths = await glob(`${pagesInDir}/**/*.{html}`);
  const componentBundlePaths = await glob(
    `${componentsOutDir}/**/*.{js,mjs,ts}`,
  );
  if (componentBundlePaths.length > 0) {
    console.log("");
    console.log(STEP_COLOR, "Hoisting CSS...");
    const documentHtmlInPath = `${publicInDir}/document.html`;
    let documentHtml = await fs.promises
      .readFile(documentHtmlInPath, "utf-8")
      .catch(() => "");
    const scopedCssSet = new Set<string>();
    await Promise.all(
      componentBundlePaths.map(async (bundlePath) => {
        const fileName = path.parse(bundlePath).name;
        if (!fileName.startsWith("chunk-")) {
          const componentBundle = (
            await import(`./${bundlePath.replace(/\\/g, "/")}`)
          ).default;
          if (Array.isArray(componentBundle)) {
            componentBundle.forEach((spec: ComponentSpec) => {
              if (spec.css) {
                scopedCssSet.add(
                  spec.html && spec.tag
                    ? getScopedCSS(spec.css, spec.tag)
                    : spec.css,
                );
              }
            });
          }
        }
      }),
    );
    await fs.promises.mkdir(publicOutDir, { recursive: true });

    // Compile impower-ui's Tailwind utilities (scanning impower-dev's classes)
    // and inline them into the SSG <style> block — mirrors the dev SSG
    // (viteStaticallyRenderedPagesPlugin). Production has no running dev server,
    // so spin up a transient middleware-mode server just to run the CSS through
    // Vite's pipeline. Without this the prod page ships unstyled (Tailwind
    // classes with no stylesheet to resolve them).
    let tailwindCss = "";
    {
      const cssServer = await createServer({
        configFile: false,
        root: process.cwd(),
        resolve: { alias, dedupe },
        plugins: [tailwindcss()],
        // No HMR: this is a one-shot build-time compile; the HMR ws server
        // would otherwise grab port 24678 and clash with any running dev server.
        server: { middlewareMode: true, hmr: false },
        logLevel: "warn",
      });
      try {
        // Use the `/@fs/<abs>` form — a transient (non-serve) server doesn't
        // resolve the `/node_modules/...` URL form, but the explicit fs path
        // loads. `?direct` returns the compiled CSS (Tailwind utilities for
        // impower-dev's classes via root auto-detection + impower-ui via the
        // stylesheet's own `@source`).
        const cssAbs = path.resolve(
          process.cwd(),
          "node_modules/@impower/impower-ui/src/style.css",
        );
        const tw = await cssServer.transformRequest(
          "/@fs/" + cssAbs.replace(/\\/g, "/") + "?direct",
        );
        if (tw?.code) tailwindCss = tw.code;
      } catch (err) {
        console.warn(
          "[ssg] Failed to compile impower-ui Tailwind CSS:",
          err instanceof Error ? err.message : err,
        );
      } finally {
        await cssServer.close();
      }
    }

    console.log("");
    console.log(STEP_COLOR, "Expanding HTML...");
    await Promise.all(
      htmlFilePaths.map(async (entryPath) => {
        const src = entryPath.replace("\\", "/");
        const dest = src.replace(pagesInDir, publicOutDir);
        console.log(SRC_COLOR, `  ${getRelativePath(src)}`);
        console.log(OUT_COLOR, `    ⤷ ${getRelativePath(dest)}`);
        const fileName = path.parse(src).name;
        const basePath = path.dirname(dest);
        const cssFilePath = `${basePath}/${fileName}.css`;
        const jsFilePath = `${basePath}/${fileName}.js`;
        const cssPath = fs.existsSync(cssFilePath)
          ? cssFilePath.replace(publicOutDir, "")
          : "";
        const mjsPath = fs.existsSync(jsFilePath)
          ? jsFilePath.replace(publicOutDir, "")
          : "";
        const html = await fs.promises.readFile(src, "utf-8").catch(() => "");
        const renderedHtml = staticallyRenderPage(
          documentHtml,
          { html, cssPath, mjsPath },
        );
        const styledHtml = staticallyStylePage(
          renderedHtml,
          [Array.from(scopedCssSet).join("\n"), tailwindCss].join("\n"),
        );
        await fs.promises.mkdir(path.dirname(dest), { recursive: true });
        await fs.promises.writeFile(dest, styledHtml, "utf-8");
      }),
    );
    // Finished processing component bundles.
    // Since these bundles are not used at runtime, they can be deleted.
    await fs.promises.rm(componentsOutDir, { recursive: true });
  } else {
    console.log("");
    console.log(STEP_COLOR, "Copying HTML Files...");
    await Promise.all(
      htmlFilePaths.map(async (entryPath) => {
        const src = entryPath.replace("\\", "/");
        const dest = src.replace(indir, outdir);
        console.log(SRC_COLOR, `  ${getRelativePath(src)}`);
        console.log(OUT_COLOR, `    ⤷ ${getRelativePath(dest)}`);
        await fs.promises.mkdir(path.dirname(dest), { recursive: true });
        await fs.promises.copyFile(src, dest);
      }),
    );
  }
};

const createPackageJson = async () => {
  const packagePath = `${outdir}/package.json`;
  if (fs.existsSync(packagePath)) {
    await fs.promises.rm(packagePath);
  }
  await fs.promises.writeFile(packagePath, `{"type": "module"}`, "utf-8");
};

const buildWorkers = async () => {
  // Build worker files
  console.log("");
  console.log(STEP_COLOR, "Building External Workers...");
  for (const externalWorkerPath of externalWorkerPaths) {
    const workerOutDir = path.resolve(process.cwd(), publicOutDir);
    console.log(SRC_COLOR, `  ${getRelativePath(externalWorkerPath)}`);
    console.log(
      OUT_COLOR,
      `    ⤷ ${getRelativePath(workerOutDir)}/${path.basename(externalWorkerPath, ".ts")}.js`,
    );
    const workerPkgRoot = externalWorkerPath.substring(
      0,
      externalWorkerPath.indexOf("/src/"),
    );
    const workerEsbuildScriptPath = path.resolve(
      process.cwd(),
      workerPkgRoot,
      "esbuild.js",
    );
    await new Promise<void>((resolve) => {
      exec(
        `node esbuild.js --outdir=${workerOutDir} ${PRODUCTION ? "--production" : ""}`,
        {
          cwd: path.dirname(workerEsbuildScriptPath),
        },
        (error, _stdout, stderr) => {
          if (error) {
            console.error(error);
          }
          if (stderr) {
            console.error(stderr);
          }
          resolve();
        },
      );
    });
  }

  console.log("");
  console.log(STEP_COLOR, "Caching Resources...");
  console.log(SRC_COLOR, `  ${getRelativePath(publicOutDir)}`);
  const publicFilePaths = await glob(
    `${publicOutDir}/**/*.{css,html,js,mjs,ico,svg,png,ttf,woff,woff2}`,
  );
  const SW_VERSION = Date.now();
  const SW_RESOURCES: string[] = ["/"];
  SW_RESOURCES.push(
    ...publicFilePaths
      .map((p) => p.replace(/\\/g, "/").replace(publicOutDir, ""))
      .filter((p) => !p.endsWith(".webmanifest")),
  );
  SW_RESOURCES.forEach((p) => {
    console.log(OUT_COLOR, `    ⤷ ${p}`);
  });

  console.log("");
  console.log(STEP_COLOR, "Building Service Workers...");
  const swInput: Record<string, string> = {};
  serviceWorkerPaths.forEach((p) => {
    console.log(SRC_COLOR, `  ${getRelativePath(p)}`);
    console.log(
      OUT_COLOR,
      `    ⤷ ${getRelativePath(p).replace(indir, outdir).replace(/\.ts$/, ".js")}`,
    );
    const name = path.basename(p, path.extname(p));
    swInput[name] = path.resolve(process.cwd(), p);
  });

  console.log("");
  await build({
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
      outDir: publicOutDir,
      emptyOutDir: false,
      minify: MINIFY,
      sourcemap: !PRODUCTION,
      rollupOptions: {
        input: swInput,
        output: {
          format: "esm",
          entryFileNames: "[name].js",
        },
        external: ["commonjs"],
      },
    },
  });
};

// ----------------------------------------------------------------------------
// Dev Serve Task
// ----------------------------------------------------------------------------

const serve = async () => {
  const vite = await createServer({
    configFile: false,
    root: process.cwd(),
    publicDir: path.resolve(process.cwd(), publicInDir),
    server: {
      middlewareMode: true,
      hmr: { port: 24679 },
      watch: { ignored: ["**/out/**", "**/.dev/**"] },
    },
    resolve: { alias, dedupe },
    // Force React-flavored deps through Vite's transform pipeline (which
    // respects resolve.alias react → preact/compat). Without noExternal,
    // these packages load via Node's CJS resolver and pull in the real React
    // installed transitively under packages/impower-ui/node_modules/react —
    // breaking SSR with "Invalid hook call" / "Invalid type passed to
    // createElement". Listing them here makes the build-time SSG render
    // Preact-compatible vnodes.
    ssr: {
      noExternal: [
        "react-resizable-panels",
        /^@radix-ui\//,
        "@impower/impower-ui",
        // The sparkdown-document-views script editor + screenplay preview
        // are now rendered as direct Preact components (not custom-element
        // tags), so the SSG walker imports their .tsx — Vite must transform
        // them through the preact/compat pipeline rather than load them as
        // raw TS via Node's resolver.
        "@impower/sparkdown-document-views",
      ],
    },
    plugins: [
      viteDefineProcessPlugin(),
      viteInlineWorkerPlugin(),
      viteLoadersPlugin(),
      preact(),
      viteStaticallyRenderedPagesPlugin(),
      tailwindcss(),
    ],
  });

  const apiModule = await vite.ssrLoadModule(`${apiInDir}/index.ts`);
  const app = apiModule.default?.app || apiModule.app || apiModule.default;
  await app.ready();

  app.use(async (req: any, res: any, next: any) => {
    vite.middlewares(req, res, next);
  });

  const PORT = Number(process.env["PORT"] || 8080);
  await app.listen({ port: PORT, host: process.env["HOST"] || "localhost" });
  console.log(FINISHED_COLOR, `Server ready at http://localhost:${PORT}`);
};

(async () => {
  if (WATCH && !PRODUCTION) {
    // In development: Use vite to serve the app with HMR
    await serve();
  } else {
    // In production: Build the app to the out folder
    console.log(STARTED_COLOR, "Build started");
    await clean();
    await copyPublic();
    await buildApi();
    await buildPages();
    await buildComponents();
    await new Promise((resolve) => setTimeout(resolve, 100));
    await expandPageComponents();
    await createPackageJson();
    await buildWorkers();
    console.log(FINISHED_COLOR, "Build finished");
  }
})();
