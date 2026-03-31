import { exec, execSync } from "child_process";
import * as dotenv from "dotenv";
import * as esbuild from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import fs from "fs";
import MagicString from "magic-string";
import path from "path";
import glob from "tiny-glob";
import { build, createServer, Plugin } from "vite";
import pkg from "./package.json";
import { ComponentSpec } from "./src/build/ComponentSpec";
import extractAllSVGs from "./src/build/extractAllSVGs";
import getScopedCSS from "./src/build/getScopedCSS";
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

const graphicCSSPaths = [
  `${indir}/modules/spark-editor/styles/icons/icons.css`,
];

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

const alias: Record<string, string> = {};
for (const depName of Object.keys(pkg.peerDependencies || {})) {
  alias[depName] = depName;
}

const PRODUCTION = process.argv.includes("--production");
const WATCH = process.argv.includes("--watch");

const LOG_PREFIX =
  (WATCH ? "[watch] " : "") + `${path.basename(process.cwd())}: `;

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

const PROCESS_ENV_BANNER_JS = `
var process = { env: ${JSON.stringify(BROWSER_VARIABLES_ENV)} };
import.meta.env = ${JSON.stringify(BROWSER_VARIABLES_ENV)};
`.trim();

// ----------------------------------------------------------------------------
// Shared Utilities
// ----------------------------------------------------------------------------

const getRelativePath = (p: string) =>
  p.replace(process.cwd() + "\\", "").replace(/\\/g, "/");

const extractGraphics = async () => {
  const graphicCSSArray = await Promise.all(
    graphicCSSPaths.map((p) =>
      fs.promises.readFile(p, "utf-8").catch(() => ""),
    ),
  );
  const injectedGraphics: Record<string, string> = {};
  graphicCSSArray.forEach((css) => {
    Object.entries(extractAllSVGs("--theme-icon-", css)).forEach(
      ([name, svg]) => {
        injectedGraphics[name] = svg;
      },
    );
  });
  return injectedGraphics;
};

const staticallyStylePage = (html: string, ssg: string) => {
  return html.replace(
    "</head>",
    `<style id="ssg-css">${ssg}\nhtml{opacity:1;}</style>\n</head>`,
  );
};

// ----------------------------------------------------------------------------
// Dev Vite Plugins
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
      const result = await build({
        configFile: false,
        build: {
          lib: { entry: file, formats: ["es"], fileName: "worker" },
          write: false,
          minify: PRODUCTION,
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

const viteLoadersPlugin = (): Plugin => ({
  name: "vite-custom-loaders",
  enforce: "pre",
  async resolveId(source, importer) {
    if (source.endsWith(".css") && !source.includes("?")) {
      const res = await this.resolve(source, importer, { skipSelf: true });
      if (res) return `${res.id}?raw`;
    }
    return null;
  },
  async load(id) {
    if (id.includes("\0")) return;
    const file = id.split("?")[0];
    if (/\.(html|css|svg|txt|csv)$/.test(file)) {
      const content = await fs.promises.readFile(file, "utf-8");
      return `export default ${JSON.stringify(content)};`;
    }
    if (/\.(ttf|woff2)$/.test(file)) {
      const buffer = await fs.promises.readFile(file);
      return `export default new Uint8Array([${Array.from(buffer).join(",")}]);`;
    }
  },
});

/**
 * HMR Plugin for Web Components
 * We inject HMR boundaries into all App JS/TS files.
 * If the updated module is a ComponentSpec, it patches the live instances.
 * If it's a dependency (like a utility), it invalidates itself to bubble the update
 * up to the web component that imported it.
 */
const viteWebComponentHmrPlugin = (): Plugin => ({
  name: "vite-web-component-hmr",
  apply: "serve",
  transform(code, id) {
    // Only apply to source files (exclude node_modules, workers, and server API logic)
    if (
      !id.includes("\0") &&
      !id.includes("node_modules") &&
      !id.includes(`/${apiInDir}/`) &&
      !id.includes(`/${workersInDir}/`) &&
      !id.includes(".worker.") &&
      /\.(ts|js|mjs)$/.test(id)
    ) {
      const ms = new MagicString(code);
      ms.append(`
        if (import.meta.hot) {
          const deepQuerySelectorAll = (selector, root = document) => {
            const results = Array.from(root.querySelectorAll(selector));
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null);
            let node;
            while (node = walker.nextNode()) {
              if (node.shadowRoot) {
                results.push(...deepQuerySelectorAll(selector, node.shadowRoot));
              }
            }
            return results;
          };

          import.meta.hot.accept((newModule) => {
            if (!newModule || !newModule.default) {
              // Not a web component (e.g., a utility function file). 
              // Bubble HMR update up to the files that imported this!
              import.meta.hot.invalidate();
              return;
            }
            
            const specs = Array.isArray(newModule.default) ? newModule.default : [newModule.default];
            let isComponent = false;
            
            specs.forEach(spec => {
              if (spec && spec.tag && spec.html) {
                isComponent = true;
                const instances = deepQuerySelectorAll(spec.tag);
                instances.forEach(el => {
                  if (typeof el.reload === 'function') {
                    el.reload(spec);
                  }
                });
              }
            });

            // If none of the exports were a ComponentSpec, bubble up to importers!
            if (!isComponent) {
              import.meta.hot.invalidate();
            }
          });
        }
      `);
      return {
        code: ms.toString(),
        map: ms.generateMap({ hires: true }),
      };
    }
    return null;
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
            const result = await build({
              configFile: false,
              plugins: [
                viteBannerPlugin(
                  `
var process = {
  env: {
    NODE_ENV: '${PRODUCTION ? "production" : "development"}',
    SW_VERSION: '${SW_VERSION}',
    SW_CACHE_NAME: 'cache-${SW_VERSION}',
    SW_RESOURCES: '${JSON.stringify(SW_RESOURCES)}',
  }
};
        `.trim(),
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

        const injectedGraphics = await extractGraphics();

        const componentPaths = await glob(
          `${componentsInDir}/**/*.{js,mjs,ts}`,
        );
        const components: Record<string, ComponentSpec> = {};
        const scopedCssSet = new Set<string>();
        for (const cp of componentPaths) {
          const module = await server.ssrLoadModule(
            `/${cp.replace(/\\/g, "/")}`,
          );
          const specs = Array.isArray(module.default)
            ? module.default
            : [module.default];
          specs.forEach((s: ComponentSpec) => {
            if (s.tag) {
              s.graphics = { ...injectedGraphics, ...(s.graphics || {}) };
              components[s.tag] = s;
            }
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
          components,
        );

        renderedHtml = await server.transformIndexHtml(req.url, renderedHtml);

        const styledHtml = staticallyStylePage(
          renderedHtml,
          Array.from(scopedCssSet).join("\n"),
        );

        res.setHeader("Content-Type", "text/html");
        res.end(styledHtml);
        return;
      } catch (e: any) {
        // Pass errors to Vite's error handler
        server.ssrFixStacktrace(e);
        return next(e);
      }

      next();
    });
  },
});

// ----------------------------------------------------------------------------
// Prod Esbuild Plugins
// ----------------------------------------------------------------------------

const esbuildDefineProcessPlugin = (): esbuild.Plugin => {
  return {
    name: "env-plugin",
    setup(build: esbuild.PluginBuild) {
      const options = build.initialOptions;
      options.write = false;
      build.onEnd(async (result) => {
        if (result.outputFiles) {
          await Promise.all(
            result.outputFiles
              .filter((f) => f.path.match(/\.js$/))
              .map((f) => {
                const modified = PROCESS_ENV_BANNER_JS + "\n" + f.text;
                return fs.promises.writeFile(f.path, modified, "utf-8");
              }),
          );
        }
      });
    },
  };
};

const esbuildInlineWorkerPlugin = (
  extraConfig?: esbuild.BuildOptions,
): esbuild.Plugin => ({
  name: "esbuild-inline-worker",
  setup(build) {
    build.onLoad({ filter: /\.worker\.(?:ts|js)$/ }, async (args) => {
      const result = await esbuild.build({
        entryPoints: [args.path],
        write: false,
        bundle: true,
        minify: PRODUCTION,
        format: "esm",
        target: "esnext",
        ...(extraConfig || {}),
      });
      let bundledText = result.outputFiles?.[0]?.text || "";
      const exportIndex = bundledText.lastIndexOf("export");
      if (exportIndex >= 0) {
        bundledText = bundledText.slice(0, exportIndex);
      }
      console.log(
        LOG_PREFIX + `loaded inline worker contents (${bundledText.length})`,
      );
      return {
        contents: bundledText,
        loader: "text",
      };
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
  // Build js files
  console.log("");
  console.log(STEP_COLOR, "Building API...");
  const entryPoints = [`${apiInDir}/index.ts`];
  entryPoints.forEach((p) => {
    console.log(SRC_COLOR, `  ${getRelativePath(p)}`);
    console.log(
      OUT_COLOR,
      `    ⤷ ${getRelativePath(p).replace(indir, outdir)}`,
    );
  });
  await esbuild.build({
    entryPoints,
    outdir: apiOutDir,
    platform: "node",
    format: "esm",
    bundle: true,
    sourcemap: !PRODUCTION,
    loader: {
      ".html": "text",
      ".css": "text",
      ".svg": "text",
      ".txt": "text",
      ".csv": "text",
      ".ttf": "binary",
      ".woff2": "binary",
    },
    external: ["@fastify/secure-session"],
    plugins: [
      esbuildPluginPino({ transports: PRODUCTION ? [] : ["pino-pretty"] }),
    ],
    banner: {
      js: `
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
      `.trim(),
    },
  });
};

const buildPages = async () => {
  // Build js files
  console.log("");
  console.log(STEP_COLOR, "Building Pages...");
  const entryPoints = (await glob(`${pagesInDir}/**/*.{js,mjs,ts}`)).filter(
    (p) => !p.endsWith(".d.ts"),
  );
  entryPoints.forEach((p) => {
    console.log(SRC_COLOR, `  ${getRelativePath(p)}`);
    console.log(
      OUT_COLOR,
      `    ⤷ ${getRelativePath(p).replace(indir, outdir)}`,
    );
  });
  await esbuild.build({
    entryPoints: entryPoints,
    outdir: publicOutDir,
    platform: "browser",
    format: "esm",
    bundle: true,
    minify: PRODUCTION,
    sourcemap: !PRODUCTION,
    loader: {
      ".html": "text",
      ".css": "text",
      ".svg": "text",
      ".txt": "text",
      ".csv": "text",
      ".ttf": "binary",
      ".woff2": "binary",
    },
    alias,
    plugins: [esbuildInlineWorkerPlugin(), esbuildDefineProcessPlugin()],
  });
};

const buildComponents = async () => {
  // Build js files
  console.log("");
  console.log(STEP_COLOR, "Building Components...");
  const entryPoints = await glob(`${componentsInDir}/**/*.{js,mjs,ts}`);
  entryPoints.forEach((p) => {
    console.log(SRC_COLOR, `  ${getRelativePath(p)}`);
    console.log(
      OUT_COLOR,
      `    ⤷ ${getRelativePath(p).replace(indir, outdir)}`,
    );
  });
  await esbuild.build({
    entryPoints: entryPoints,
    outdir: componentsOutDir,
    platform: "node",
    format: "esm",
    bundle: true,
    minify: PRODUCTION,
    sourcemap: !PRODUCTION,
    loader: {
      ".html": "text",
      ".css": "text",
      ".svg": "text",
      ".txt": "text",
      ".csv": "text",
      ".ttf": "binary",
      ".woff2": "binary",
    },
  });
};

const expandPageComponents = async () => {
  // Expand/Copy each page's html file using components.js
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
    const injectedGraphics = await extractGraphics();
    const components: Record<string, ComponentSpec> = {};
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
              if (spec.tag) {
                spec.graphics = {
                  ...(spec.graphics || {}),
                  ...injectedGraphics,
                };
                components[spec.tag] = spec;
              }
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
          components,
        );
        const styledHtml = staticallyStylePage(
          renderedHtml,
          Array.from(scopedCssSet).join("\n"),
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
  serviceWorkerPaths.forEach((p) => {
    console.log(SRC_COLOR, `  ${getRelativePath(p)}`);
    console.log(
      OUT_COLOR,
      `    ⤷ ${getRelativePath(p).replace(indir, outdir)}`,
    );
  });
  await esbuild.build({
    entryPoints: serviceWorkerPaths,
    outdir: publicOutDir,
    bundle: true,
    minify: PRODUCTION,
    sourcemap: !PRODUCTION,
    external: ["commonjs"],
    banner: {
      js: `
  var process = {
    env: {
      NODE_ENV: '${PRODUCTION ? "production" : "development"}',
      SW_VERSION: '${SW_VERSION}',
      SW_CACHE_NAME: 'cache-${SW_VERSION}',
      SW_RESOURCES: '${JSON.stringify(SW_RESOURCES)}',
    }
  };
        `.trim(),
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
      hmr: true,
      watch: { ignored: ["**/out/**", "**/.dev/**"] },
    },
    resolve: { alias },
    plugins: [
      viteDefineProcessPlugin(),
      viteInlineWorkerPlugin(),
      viteLoadersPlugin(),
      viteWebComponentHmrPlugin(),
      viteStaticallyRenderedPagesPlugin(),
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
