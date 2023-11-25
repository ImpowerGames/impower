import { exec } from "child_process";
import chokidar from "chokidar";
import * as dotenv from "dotenv";
import { build } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import fs from "fs";
import path from "path";
import glob from "tiny-glob";
import { ComponentSpec } from "./src/build/ComponentSpec";
import getScopedCSS from "./src/build/getScopedCSS";
import renderPage from "./src/build/renderPage";

const RESET = "\x1b[0m";
const STRING = "%s";
const RED = "\x1b[31m" + STRING + RESET;
const GREEN = "\x1b[32m" + STRING + RESET;
const YELLOW = "\x1b[33m" + STRING + RESET;
const BLUE = "\x1b[34m" + STRING + RESET;
const MAGENTA = "\x1b[35m" + STRING + RESET;
const CYAN = "\x1b[36m" + STRING + RESET;

const ERROR_COLOR = RED;
const STARTED_COLOR = YELLOW;
const FINISHED_COLOR = CYAN;
const STEP_COLOR = BLUE;
const SRC_COLOR = GREEN;
const OUT_COLOR = MAGENTA;

const indir = "src";
const outdir = "out";

const apiInDir = `${indir}/api`;
const apiOutDir = `${outdir}/api`;

const componentsInDir = `${indir}/components`;
const componentsOutDir = `${outdir}/components`;

const publicInDir = `${indir}/public`;
const publicOutDir = `${outdir}/public`;

const pagesInDir = `${indir}/pages`;

const localDependencies = `node_modules/@impower`;

const watchDirs = [
  `${indir}/modules`,
  "../packages/spark-engine",
  "../packages/sparkdown",
  "../packages/spark-dom",
  "../packages/grammar-compiler",
];

const args = process.argv.slice(2);
const WATCH = args.includes("--watch");
const PRODUCTION = args.includes("--production");
if (PRODUCTION) {
  process.env["NODE_ENV"] = "production";
}

if (!PRODUCTION) {
  // During development, populate process.env with variables from local .env file
  dotenv.config();
}

const BROWSER_VARIABLES: Record<string, string> = {};
Object.entries(process.env).forEach(([key, value]) => {
  if (key.startsWith("BROWSER_") && value) {
    BROWSER_VARIABLES[`process.env.${key}`] = `"${value}"`;
  }
});

const getRelativePath = (p: string) =>
  p.replace(process.cwd() + "\\", "").replaceAll("\\", "/");

const clean = async () => {
  await Promise.all(
    [apiOutDir, componentsOutDir, publicOutDir].map((d) =>
      fs.promises.rm(d, { recursive: true, force: true })
    )
  );
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
  const entryPoints = await glob(`${pagesInDir}/**/*.{js,mjs,ts}`);
  entryPoints.forEach((p) => {
    console.log(SRC_COLOR, `  ${getRelativePath(p)}`);
    console.log(
      OUT_COLOR,
      `    ⤷ ${getRelativePath(p).replace(indir, outdir)}`
    );
  });
  // Spread browser variables to avoid "process not defined" error
  const define = { ...BROWSER_VARIABLES };
  const browserVariableEntries = Object.entries(define);
  if (browserVariableEntries.length > 0) {
    console.log("");
    console.log(STEP_COLOR, "Defining Browser Variables...");
    browserVariableEntries.forEach(([key, value]) => {
      console.log(SRC_COLOR, `  ${key}=${value}`);
    });
  } else {
    console.log("");
    console.error(ERROR_COLOR, "No Browser Variables Found.");
  }
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
    },
    define,
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
    },
    define: BROWSER_VARIABLES,
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
    const globalCssInPath = `${publicInDir}/global.css`;
    const globalCssOutPath = `${publicOutDir}/global.css`;
    let globalCSS = await fs.promises
      .readFile(globalCssInPath, "utf-8")
      .catch(() => "");
    const components: Record<string, ComponentSpec> = {};
    const componentCSS = new Set<string>();
    await Promise.all(
      componentBundlePaths.map(async (bundlePath) => {
        const fileName = path.parse(bundlePath).name;
        if (!fileName.startsWith("chunk-")) {
          console.log(SRC_COLOR, `  ${getRelativePath(bundlePath)}`);
          console.log(OUT_COLOR, `    ⤷ ${getRelativePath(globalCssOutPath)}`);
          const componentBundle = (
            await import(`./${bundlePath.replaceAll("\\", "/")}`)
          ).default;
          if (Array.isArray(componentBundle)) {
            componentBundle.forEach((spec: ComponentSpec) => {
              if (spec.tag) {
                components[spec.tag] = spec;
              }
              if (spec.css) {
                const cssArray =
                  typeof spec.css === "string" ? [spec.css] : spec.css;
                cssArray.forEach((css) => {
                  const scopedCSS =
                    spec.html && spec.tag ? getScopedCSS(css, spec.tag) : css;
                  componentCSS.add(scopedCSS);
                });
              }
            });
          }
        }
      })
    );
    componentCSS.forEach((css) => {
      globalCSS += css + "\n\n";
    });
    globalCSS += "html{opacity:1;}";
    await fs.promises.mkdir(publicOutDir, { recursive: true });
    await fs.promises.writeFile(globalCssOutPath, globalCSS, "utf-8");
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
          ? cssFilePath.replace(outdir, "")
          : "";
        const mjsPath = fs.existsSync(jsFilePath)
          ? jsFilePath.replace(outdir, "")
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
  await fs.promises.writeFile(
    `${outdir}/package.json`,
    `{"type": "module"}`,
    "utf-8"
  );
};

const buildWorkers = async () => {
  return new Promise((resolve) => {
    exec("npm run build-workers", resolve);
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
  const { app, reloader } = (await import("./out/api/index.js")).default;
  await app.ready();
  const rebuild = async () => {
    await buildAll();
    await new Promise((resolve) => setTimeout(resolve, 100));
    if ("reload" in reloader && typeof reloader.reload === "function") {
      reloader.reload();
    }
  };
  console.log(YELLOW, `Watching for changes...`);
  chokidar
    .watch(
      [
        publicInDir,
        apiInDir,
        localDependencies,
        componentsInDir,
        pagesInDir,
        ...watchDirs,
      ],
      {
        ignoreInitial: true,
        followSymlinks: true,
      }
    )
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
