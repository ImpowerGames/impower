import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { exec } from "child_process";
import fs from "fs";
import path from "path";
import glob from "tiny-glob";
import { build, createServer } from "vite";
import staticallyRenderPage from "./src/build/staticallyRenderPage.js";
import {
  alias,
  apiInDir,
  apiOutDir,
  browserEnvDefine,
  dedupe,
  externalWorkerPaths,
  getServiceWorkerProcessEnvBanner,
  impowerUiStyleCss,
  indir,
  MINIFY,
  outdir,
  pagesInDir,
  PATH_RESOLUTION_BANNER,
  PRODUCTION,
  publicInDir,
  publicOutDir,
  readEditorGlobalCss,
  serviceWorkerPaths,
  staticallyStylePage,
  viteBannerPlugin,
  viteStaticallyRenderedPagesPlugin,
  WATCH,
} from "./vite.config.js";

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

const getRelativePath = (p: string) =>
  p.replace(process.cwd() + "\\", "").replace(/\\/g, "/");

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
    define: browserEnvDefine,
    plugins: [tailwindcss()],
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

const expandPageComponents = async () => {
  const htmlFilePaths = await glob(`${pagesInDir}/**/*.{html}`);

  console.log("");
  console.log(STEP_COLOR, "Hoisting CSS...");
  const documentHtml = await fs.promises
    .readFile(`${publicInDir}/document.html`, "utf-8")
    .catch(() => "");

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
      // No HMR: this is a one-shot build-time compile; the HMR ws server would
      // otherwise grab a port and clash with any running dev server.
      server: { middlewareMode: true, hmr: false },
      logLevel: "warn",
    });
    try {
      // `/@fs/<abs>?direct` returns the compiled stylesheet (Tailwind utilities
      // for impower-dev's classes via root auto-detection + impower-ui via the
      // stylesheet's own `@source`).
      const tw = await cssServer.transformRequest(
        "/@fs/" + impowerUiStyleCss.replace(/\\/g, "/") + "?direct",
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

  // Editor-global CSS (normalize + theme) first, then impower-ui's Tailwind.
  const ssgCss = [readEditorGlobalCss(), tailwindCss]
    .filter(Boolean)
    .join("\n");

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
      const renderedHtml = staticallyRenderPage(documentHtml, {
        html,
        cssPath,
        mjsPath,
      });
      const styledHtml = staticallyStylePage(renderedHtml, ssgCss);
      await fs.promises.mkdir(path.dirname(dest), { recursive: true });
      await fs.promises.writeFile(dest, styledHtml, "utf-8");
    }),
  );
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
    define: browserEnvDefine,
    // Point the dependency scanner at the real client entry (the page JS).
    // Otherwise Vite auto-globs the project's *.html files as scan entries —
    // but the HTML shells carry no <script> (the SSG injects the page module at
    // render time), so scanning them finds nothing and also picks up stale out/
    // artifacts. Scanning the .ts entry is what lets pre-bundling actually run.
    optimizeDeps: {
      entries: [`${pagesInDir}/**/*.{js,mjs,ts}`, "!**/*.d.ts"],
    },
    // Force React-flavored deps through Vite's transform pipeline (which
    // respects resolve.alias react → preact/compat). Without noExternal,
    // these packages load via Node's CJS resolver and pull in the real React
    // installed transitively under packages/impower-ui/node_modules/react —
    // breaking SSR with "Invalid hook call" / "Invalid type passed to
    // createElement". Listing them here makes the build-time SSG render
    // Preact-compatible vnodes.
    ssr: {
      noExternal: [
        // The Radix react-ecosystem (@radix-ui/*, @floating-ui/*, and the
        // react-*/use-*/aria-hidden helper packages they pull in) all
        // `import "react"`. Externalized, that bare import hits Node's resolver
        // (no react — the app is Preact) and the dev SSG render throws "Cannot
        // find module/package 'react'". Bundling them routes the import through
        // the react → preact/compat alias above. (Prod bundles everything, so
        // this only matters for the dev server's ssrLoadModule path.)
        // Any react-named package, in any scope: react, react-dom, react-*,
        // @tanstack/react-virtual, etc.
        /(?:^|\/)react(?:-|\/|$)/,
        /^@radix-ui\//,
        /^@floating-ui\//,
        // Radix helpers that import react but aren't react-named.
        /^use-/,
        "aria-hidden",
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
    await expandPageComponents();
    await createPackageJson();
    await buildWorkers();
    console.log(FINISHED_COLOR, "Build finished");
  }
})();
