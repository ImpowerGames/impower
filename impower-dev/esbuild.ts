import chokidar from "chokidar";
import { build } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import fs from "fs";
import path from "path";
import glob from "tiny-glob";
import renderPage from "./src/build/renderPage";
import scopeCss from "./src/build/scopeCss";

type Component = () => { css?: string; html?: string | undefined };

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

const componentsInDir = `${indir}/components`;
const componentsOutDir = `${outdir}/components`;

const pagesInDir = `${indir}/pages`;
const pagesOutDir = `${outdir}/public`;

const publicInDir = `${indir}/public`;
const publicOutDir = `${outdir}/public`;

const localDependencies = `node_modules/@impower`;

const args = process.argv.slice(2);
const WATCH = args.includes("--watch");
const SERVE = args.includes("--serve");
const PRODUCTION = args.includes("--production");
if (PRODUCTION) {
  process.env["NODE_ENV"] = "production";
}

const getRelativePath = (p: string) =>
  p.replace(process.cwd() + "\\", "").replaceAll("\\", "/");

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
    },
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
  await build({
    entryPoints: entryPoints,
    outdir: pagesOutDir,
    platform: "browser",
    bundle: true,
    minify: PRODUCTION,
    sourcemap: !PRODUCTION,
    loader: {
      ".html": "text",
      ".css": "text",
      ".svg": "text",
    },
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
    if (!PRODUCTION && SERVE) {
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
    const components: Record<string, Component> = {};
    await Promise.all(
      componentBundlePaths.map(async (bundlePath) => {
        const fileName = path.parse(bundlePath).name;
        if (!fileName.startsWith("chunk-")) {
          console.log(SRC_COLOR, `  ${getRelativePath(bundlePath)}`);
          console.log(OUT_COLOR, `    ⤷ ${getRelativePath(globalCssOutPath)}`);
          const componentBundle = (
            await import(`./${bundlePath.replaceAll("\\", "/")}`)
          ).default;
          Object.entries(componentBundle).forEach(([tagName, component]) => {
            if (typeof component === "function") {
              const { html, css } = component();
              if (html) {
                components[tagName] = component as Component;
              }
              if (css) {
                const scope = html ? tagName : undefined;
                globalCSS += scopeCss(css, scope) + "\n\n";
              }
            }
          });
        }
      })
    );
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
        const jsPath = fs.existsSync(jsFilePath)
          ? jsFilePath.replace(outdir, "")
          : "";
        let html = await fs.promises.readFile(src, "utf-8").catch(() => "");
        const pageComponent = () => ({ html, cssPath, jsPath });
        html = renderPage(documentHtml, pageComponent, components);
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

const watchPublic = async (onRebuild: Function) => {
  console.log(YELLOW, `Watching ${publicInDir} for changes...`);
  chokidar
    .watch(publicInDir, { ignoreInitial: true })
    .on("all", async (event, path) => {
      console.log(SRC_COLOR, `${event} ${getRelativePath(path)}`);
      await copyPublic();
      onRebuild();
    });
};

const watchApi = async (onRebuild: Function) => {
  console.log(YELLOW, `Watching ${apiInDir} for changes...`);
  chokidar
    .watch(apiInDir, { ignoreInitial: true })
    .on("all", async (event, path) => {
      console.log(SRC_COLOR, `${event} ${getRelativePath(path)}`);
      await buildApi();
      onRebuild();
    });
};

const watchPages = async (onRebuild: Function) => {
  console.log(YELLOW, `Watching ${pagesInDir} for changes...`);
  chokidar
    .watch(
      [
        localDependencies,
        ...["ts", "js", "mjs"].map((ext) => `${pagesInDir}/**/*.${ext}`),
      ],
      { ignoreInitial: true, followSymlinks: true }
    )
    .on("all", async (event, path) => {
      console.log(SRC_COLOR, `${event} ${getRelativePath(path)}`);
      await buildPages();
      onRebuild();
    });
};

const watchComponents = async (onRebuild: Function) => {
  console.log(YELLOW, `Watching ${componentsInDir} for changes...`);
  chokidar
    .watch([localDependencies, componentsInDir, `${pagesInDir}/**/*.html`], {
      ignoreInitial: true,
      followSymlinks: true,
    })
    .on("all", async (event, path) => {
      console.log(SRC_COLOR, `${event} ${getRelativePath(path)}`);
      await buildComponents();
      await expandPageComponents();
      onRebuild();
    });
};

(async () => {
  console.log(STARTED_COLOR, "Build started");
  await clean();
  await copyPublic();
  await buildApi();
  await buildPages();
  await buildComponents();
  await expandPageComponents();
  await createPackageJson();
  console.log("");
  console.log(FINISHED_COLOR, "Build finished");
  if (SERVE) {
    const { app, reloader } = (await import("./out/api/index.js")).default;
    if (!PRODUCTION) {
      await app.ready();
      if (WATCH) {
        const onRebuild = async () => {
          if ("reload" in reloader && typeof reloader.reload === "function") {
            reloader.reload();
          }
        };
        watchPublic(onRebuild);
        watchApi(onRebuild);
        watchPages(onRebuild);
        watchComponents(onRebuild);
      }
    }
  }
})();

process.on("SIGTERM", () => {
  process.exit(0);
});
process.on("SIGINT", () => {
  process.exit(0);
});
