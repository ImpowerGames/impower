import chokidar from "chokidar";
import { build } from "esbuild";
import fs from "fs";
import path from "path";
import glob from "tiny-glob";

const GREEN = "\x1b[32m%s\x1b[0m";
const YELLOW = "\x1b[33m%s\x1b[0m";
const BLUE = "\x1b[34m%s\x1b[0m";
const MAGENTA = "\x1b[35m%s\x1b[0m";

const indir = "src";
const outdir = "out";

const apiInDir = `${indir}/api`;
const apiOutDir = `${outdir}/api`;

const componentsInDir = `${indir}/components`;
const componentsOutDir = `${outdir}/components`;

const pagesInDir = `${indir}/pages`;
const pagesOutDir = `${outdir}/pages`;

const publicInDir = `${indir}/public`;
const publicOutDir = `${outdir}/public`;

const args = process.argv.slice(2);
const watch = args.includes("--watch");
const serve = args.includes("--serve");
const production = args.includes("--production");
if (production) {
  process.env.NODE_ENV = "production";
}

const getRelativePath = (p) =>
  p.replace(process.cwd() + "\\", "").replaceAll("\\", "/");

const onBuildEndPlugin = () => {
  return {
    name: "on-build-end-plugin",
    setup(build) {
      const options = build.initialOptions;
      options.write = false;
      build.onEnd(async (result) => {
        const files = result.outputFiles;
        const filesListSummary =
          "  " + files.map((file) => getRelativePath(file.path)).join("\n  ");
        console.log(BLUE, "Building Files...");
        console.log(GREEN, filesListSummary);
        await Promise.all(
          files.map(async (file) => {
            await fs.mkdirSync(path.dirname(file.path), { recursive: true });
            await fs.promises.writeFile(file.path, file.text, "utf-8");
          })
        );
      });
    },
  };
};

const clean = async () => {
  await fs.promises.rm(outdir, { recursive: true, force: true });
};

const buildApi = async () => {
  const entryPoints = await glob(`${apiInDir}/**/*.{js,mjs,ts}`);
  return build({
    entryPoints: entryPoints,
    outdir: apiOutDir,
    platform: "node",
    format: "esm",
    sourcemap: process.env.NODE_ENV !== "production",
    loader: {
      ".html": "text",
      ".css": "text",
      ".svg": "text",
    },
    plugins: [onBuildEndPlugin()],
  });
};

const buildComponents = async () => {
  const entryPoints = await glob(`${componentsInDir}/**/*.{js,mjs,ts}`);
  return build({
    entryPoints: entryPoints,
    outdir: componentsOutDir,
    platform: "node",
    format: "esm",
    bundle: true,
    minify: process.env.NODE_ENV === "production",
    sourcemap: process.env.NODE_ENV !== "production",
    loader: {
      ".html": "text",
      ".css": "text",
      ".svg": "text",
    },
    plugins: [onBuildEndPlugin()],
  });
};

const buildPages = async () => {
  const entryPoints = await glob(`${pagesInDir}/**/*.{js,mjs,ts}`);
  return build({
    entryPoints: entryPoints,
    outdir: pagesOutDir,
    platform: "browser",
    format: "esm",
    bundle: true,
    minify: process.env.NODE_ENV === "production",
    sourcemap: process.env.NODE_ENV !== "production",
    loader: {
      ".html": "text",
      ".css": "text",
      ".svg": "text",
    },
    plugins: [onBuildEndPlugin()],
  });
};

const copyStaticFiles = async () => {
  const staticEntryPoints = await glob(`${pagesInDir}/**/*.{html,css}`);
  const filesListSummary =
    "  " +
    staticEntryPoints
      .map((p) => getRelativePath(p.replace(indir, outdir)))
      .join("\n  ");
  console.log(BLUE, "Copying Files...");
  console.log(GREEN, filesListSummary);
  await Promise.all(
    staticEntryPoints.map(async (entryPath) => {
      const src = entryPath.replace("\\", "/");
      const dest = src.replace(indir, outdir);
      await fs.mkdirSync(path.dirname(dest), { recursive: true });
      await fs.promises.copyFile(src, dest);
    })
  );
};

const copyPublic = async () => {
  console.log(BLUE, "Copying Folder...");
  console.log(GREEN, `  ${publicOutDir}`);
  await fs.mkdirSync(publicOutDir, { recursive: true });
  await fs.promises.cp(publicInDir, publicOutDir, { recursive: true });
};

const setupLivereload = async () => {
  const livereloadScript = `<script>new EventSource('/livereload').onmessage = () => location.reload()</script>`;
  const documentHtml = await fs.promises.readFile(
    path.join(publicInDir, "document.html"),
    "utf-8"
  );
  const transformedDocumentHtml = documentHtml.replace(
    "</html>",
    livereloadScript + "\n</html>"
  );
  await fs.promises.writeFile(
    path.join(publicOutDir, "document.html"),
    transformedDocumentHtml,
    "utf-8"
  );
};

const watchApi = async (onRebuild) => {
  console.log(YELLOW, `Watching ${apiInDir} for changes...`);
  chokidar
    .watch(apiInDir, { ignoreInitial: true })
    .on("all", async (event, path) => {
      console.log(BLUE, `${event} ${getRelativePath(path)}`);
      await buildApi();
      onRebuild();
    });
};

const watchComponents = async (onRebuild) => {
  console.log(YELLOW, `Watching ${componentsInDir} for changes...`);
  chokidar
    .watch(componentsInDir, { ignoreInitial: true })
    .on("all", async (event, path) => {
      console.log(BLUE, `${event} ${getRelativePath(path)}`);
      await buildComponents();
      onRebuild();
    });
};

const watchPages = async (onRebuild) => {
  console.log(YELLOW, `Watching ${pagesInDir} for changes...`);
  chokidar
    .watch(pagesInDir, { ignoreInitial: true })
    .on("all", async (event, path) => {
      console.log(BLUE, `${event} ${getRelativePath(path)}`);
      await buildPages();
      await copyStaticFiles();
      onRebuild();
    });
};

const watchPublic = async (onRebuild) => {
  console.log(YELLOW, `Watching ${publicInDir} for changes...`);
  chokidar
    .watch(publicInDir, { ignoreInitial: true })
    .on("all", async (event, path) => {
      console.log(BLUE, `${event} ${getRelativePath(path)}`);
      await copyPublic();
      onRebuild();
    });
};

(async () => {
  console.log(YELLOW, "Build started");
  await clean();
  await buildApi();
  await buildComponents();
  await buildPages();
  await copyStaticFiles();
  await copyPublic();
  if (serve) {
    await setupLivereload();
    const startServer = (await import("./out/api/development.js")).default;
    let app = await startServer();
    const onRebuild = async () => {
      app.reload();
    };
    if (watch) {
      watchApi(onRebuild);
      watchComponents(onRebuild);
      watchPages(onRebuild);
      watchPublic(onRebuild);
    }
  }
  console.log(MAGENTA, "Build finished");
})();
