import { exec } from "child_process";
import chokidar from "chokidar";
import * as dotenv from "dotenv";
import { build, Plugin, PluginBuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import fs from "fs";
import path from "path";
import glob from "tiny-glob";
import { ComponentSpec } from "./src/build/ComponentSpec";
import extractAllSVGs from "./src/build/extractAllSVGs";
import getScopedCSS from "./src/build/getScopedCSS";
import renderPage from "./src/build/renderPage";

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

const apiInDir = `${indir}/api`;
const apiOutDir = `${outdir}/api`;

const workerPaths = [`${indir}/workers/sw.ts`];

const componentsInDir = `${indir}/components`;
const componentsOutDir = `${outdir}/components`;

const publicInDir = `${indir}/public`;
const publicOutDir = `${outdir}/public`;

const pagesInDir = `${indir}/pages`;

const graphicCSSPaths = [
  `${indir}/modules/spark-editor/styles/icons/icons.css`,
];

const watchDirs = [
  `${indir}/modules`,
  `${indir}/workers`,
  "../packages/spark-engine/src",
  "../packages/sparkdown/src",
  "../packages/sparkdown-screenplay/src",
  "../packages/spark-dom/src",
  "../packages/textmate-grammar-tree/src",
];

const args = process.argv.slice(2);
const WATCH = args.includes("--watch");
const PRODUCTION =
  process.env["NODE_ENV"] === "production" || args.includes("--production");

if (!PRODUCTION) {
  // During development, populate process.env with variables from local .env file
  dotenv.config();
}

const BROWSER_VARIABLES_ENV: Record<string, string> = {};
Object.entries(process.env).forEach(([key, value]) => {
  if (value && key.startsWith("BROWSER_")) {
    BROWSER_VARIABLES_ENV[key] = value;
  }
});
// Because esbuild's built-in `define` and `banner` features occasionally cause "process not defined" errors in production builds,
// We simply concatenate the process.env definition to the top of the minified files.
const PROCESS_ENV_BANNER_JS = `var process = { env: ${JSON.stringify(
  BROWSER_VARIABLES_ENV
)} };`.trim();
console.log(STEP_COLOR, "Populating banner...");
console.log(SRC_COLOR, `  ${PROCESS_ENV_BANNER_JS}`);
console.log("");

const envPlugin = (): Plugin => {
  return {
    name: "env-plugin",
    setup(build: PluginBuild) {
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
              })
          );
        }
      });
    },
  };
};

const getRelativePath = (p: string) =>
  p.replace(process.cwd() + "\\", "").replace(/\\/g, "/");

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
      `    ⤷ ${getRelativePath(p).replace(indir, outdir)}`
    );
  });
  await build({
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
    (p) => !p.endsWith(".d.ts")
  );
  entryPoints.forEach((p) => {
    console.log(SRC_COLOR, `  ${getRelativePath(p)}`);
    console.log(
      OUT_COLOR,
      `    ⤷ ${getRelativePath(p).replace(indir, outdir)}`
    );
  });
  await build({
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
    alias: {
      "@lezer/common": "@lezer/common",
    },
    plugins: [envPlugin()],
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
      `    ⤷ ${getRelativePath(p).replace(indir, outdir)}`
    );
  });
  await build({
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
    `${componentsOutDir}/**/*.{js,mjs,ts}`
  );
  if (componentBundlePaths.length > 0) {
    console.log("");
    console.log(STEP_COLOR, "Hoisting CSS...");
    const documentHtmlInPath = `${publicInDir}/document.html`;
    let documentHtml = await fs.promises
      .readFile(documentHtmlInPath, "utf-8")
      .catch(() => "");
    if (!PRODUCTION) {
      documentHtml = documentHtml.replace(
        "</html>",
        `<script>new EventSource('/livereload').onmessage = () => location.reload()</script>\n</html>`
      );
    }
    const graphicCSSArray = await Promise.all(
      graphicCSSPaths.map((path) =>
        fs.promises.readFile(path, "utf-8").catch(() => "")
      )
    );
    const injectedGraphics: Record<string, string> = {};
    graphicCSSArray.forEach((css) => {
      Object.entries(extractAllSVGs("--s-icon-", css)).forEach(
        ([name, svg]) => {
          injectedGraphics[name] = svg;
        }
      );
    });
    const ssgCssInPath = `${publicInDir}/ssg.css`;
    const ssgCssOutPath = `${publicOutDir}/ssg.css`;
    let ssgCSS = await fs.promises
      .readFile(ssgCssInPath, "utf-8")
      .catch(() => "");
    const components: Record<string, ComponentSpec> = {};
    const scopedCssSet = new Set<string>();
    await Promise.all(
      componentBundlePaths.map(async (bundlePath) => {
        const fileName = path.parse(bundlePath).name;
        if (!fileName.startsWith("chunk-")) {
          console.log(SRC_COLOR, `  ${getRelativePath(bundlePath)}`);
          console.log(OUT_COLOR, `    ⤷ ${getRelativePath(ssgCssOutPath)}`);
          const componentBundle = (
            await import(`./${bundlePath.replace(/\\/g, "/")}`)
          ).default;
          if (Array.isArray(componentBundle)) {
            componentBundle.forEach((spec: ComponentSpec) => {
              if (spec.tag) {
                spec.graphics = {
                  ...(spec.graphics || {}),
                  ...(injectedGraphics || {}),
                };
                components[spec.tag] = spec;
              }
              if (spec.css) {
                const cssArray =
                  typeof spec.css === "string" ? [spec.css] : spec.css;
                cssArray.forEach((css) => {
                  const scopedCSS =
                    spec.html && spec.tag ? getScopedCSS(css, spec.tag) : css;
                  scopedCssSet.add(scopedCSS);
                });
              }
            });
          }
        }
      })
    );
    scopedCssSet.forEach((css) => {
      ssgCSS += css + "\n\n";
    });
    ssgCSS += "html{opacity:1;}";
    await fs.promises.mkdir(publicOutDir, { recursive: true });
    await fs.promises.writeFile(ssgCssOutPath, ssgCSS, "utf-8");
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
        let html = await fs.promises.readFile(src, "utf-8").catch(() => "");
        const page = { html, cssPath, mjsPath };
        html = renderPage(documentHtml, page, components);
        await fs.promises.mkdir(path.dirname(dest), { recursive: true });
        await fs.promises.writeFile(dest, html, "utf-8");
      })
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
      })
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
  console.log(STEP_COLOR, "Building Workers...");
  workerPaths.forEach((p) => {
    console.log(SRC_COLOR, `  ${getRelativePath(p)}`);
    console.log(
      OUT_COLOR,
      `    ⤷ ${getRelativePath(p).replace(indir, outdir)}`
    );
  });
  await new Promise<void>((resolve) => {
    exec(
      `npm run build:workers:${PRODUCTION ? "prod" : "dev"}`,
      (error, stdout, stderr) => {
        if (error) {
          console.error(error);
        }
        if (stdout) {
          console.log(stdout);
        }
        if (stderr) {
          console.error(stderr);
        }
        resolve();
      }
    );
  });
  console.log("");
  console.log(STEP_COLOR, "Caching Resources...");
  console.log(SRC_COLOR, `  ${getRelativePath(publicOutDir)}`);
  const publicFilePaths = await glob(
    `${publicOutDir}/**/*.{css,html,js,mjs,ico,svg,png,ttf,woff,woff2}`
  );
  const SW_VERSION = Date.now();
  const SW_RESOURCES: string[] = ["/"];
  SW_RESOURCES.push(
    ...publicFilePaths
      .map((p) => p.replace(/\\/g, "/").replace(publicOutDir, ""))
      .filter((p) => !p.endsWith(".webmanifest"))
  );
  SW_RESOURCES.forEach((p) => {
    console.log(OUT_COLOR, `    ⤷ ${p}`);
  });
  await build({
    entryPoints: workerPaths,
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

const buildAll = async () => {
  await clean();
  await copyPublic();
  await buildApi();
  await buildPages();
  await buildComponents();
  await new Promise((resolve) => setTimeout(resolve, 100));
  await expandPageComponents();
  await createPackageJson();
  await buildWorkers();
};

const DEBOUNCE_DELAY = 200;
let pendingBuildTimeout: NodeJS.Timeout | undefined;

const watchFiles = async () => {
  // @ts-expect-error
  const { app } = (await import("./out/api/index.js")).default;
  await app.ready();
  const rebuild = async () => {
    await buildAll();
    await new Promise((resolve) => setTimeout(resolve, 100));
    await fetch(
      `http://${process.env["HOST"] || "localhost"}:${
        process.env["PORT"] || 8080
      }/livereload`,
      {
        method: "POST",
      }
    );
  };
  console.log(YELLOW, `Watching for changes...`);
  chokidar
    .watch([publicInDir, apiInDir, componentsInDir, pagesInDir, ...watchDirs], {
      ignoreInitial: true,
      followSymlinks: true,
    })
    .on("all", async (event, path) => {
      console.log(SRC_COLOR, `${event} ${getRelativePath(path)}`);
      if (pendingBuildTimeout) {
        clearTimeout(pendingBuildTimeout);
        pendingBuildTimeout = undefined;
      }
      pendingBuildTimeout = setTimeout(rebuild, DEBOUNCE_DELAY);
    });
};

(async () => {
  console.log(STARTED_COLOR, "Build started");
  await buildAll();
  console.log("");
  console.log(FINISHED_COLOR, "Build finished");
  if (WATCH) {
    watchFiles();
  }
})();

process.on("SIGTERM", () => {
  process.exit(0);
});
process.on("SIGINT", () => {
  process.exit(0);
});
