import { execSync, spawn } from "child_process";
import * as chokidar from "chokidar";
import * as dotenv from "dotenv";
import fs from "fs";
import { createRequire } from "module";
import path from "path";
import glob from "tiny-glob";
import { build, defineConfig, Plugin } from "vite";
import { filterSVG } from "../packages/sparkdown/src/compiler/utils/filterSVG";
import {
  parseImageFilterParam,
  serializeImageFilterParam,
} from "../packages/sparkdown/src/filters/filteredSvg";
import {
  parseMorphAssetRequest,
  serveMorphAsset,
} from "../packages/sparkdown/src/morph/assetService";
import { MorphBakeService } from "../packages/sparkdown/src/morph/service";
import { clampThumbnailWidth } from "../packages/sparkdown/src/thumbnails/composeThumbnail";
import pkg from "./package.json";
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
const publicInDir = `${indir}/public`;
const publicOutDir = `${outdir}/public`;
const pagesInDir = `${indir}/pages`;

const DEDUPE_ONLY = new Set(["preact", "preact-custom-element"]);

const require = createRequire(import.meta.url);
const resolvePkgDir = (name: string): string => {
  const segs = name.split("/");
  try {
    return path.dirname(
      require.resolve(`${name}/package.json`, { paths: [process.cwd()] }),
    );
  } catch {
  }
  try {
    const entry = require.resolve(name, { paths: [process.cwd()] });
    const marker = path.join("node_modules", ...segs);
    const idx = entry.lastIndexOf(marker);
    if (idx >= 0) {
      return entry.slice(0, idx + marker.length);
    }
  } catch {
  }
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

const preactCompat = require.resolve("preact/compat", {
  paths: [process.cwd()],
});
alias["react"] = preactCompat;
alias["react-dom"] = preactCompat;

const ssrNoExternal: (string | RegExp)[] = [
  /(?:^|\/)react(?:-|\/|$)/,
  /^@radix-ui\//,
  /^@floating-ui\//,
  /^use-/,
  "aria-hidden",
  "@impower/impower-ui",
  "@impower/sparkdown-document-views",
];

const impowerUiStyleCss = path.join(
  resolvePkgDir("@impower/impower-ui"),
  "src/style.css",
);

const PRODUCTION = process.argv.includes("--production");
const WATCH = process.argv.includes("--watch");
const MINIFY = process.argv.includes("--minify");

const envPrefix = PRODUCTION ? ".env.production" : ".env.development";
const envFiles = fs
  .readdirSync(process.cwd())
  .filter((f) => f.startsWith(envPrefix))
  .sort();
for (const file of envFiles) {
  dotenv.config({ path: path.join(process.cwd(), file), override: false });
}

const DEV_ONLY_ENV_KEYS = new Set(["VITE_SAME_ORIGIN_PREVIEW"]);

const BROWSER_VARIABLES_ENV: Record<string, string> = {};
Object.entries(process.env).forEach(([key, value]) => {
  if (value && (key.startsWith("BROWSER_") || key.startsWith("VITE_"))) {
    if (PRODUCTION && DEV_ONLY_ENV_KEYS.has(key)) {
      return;
    }
    BROWSER_VARIABLES_ENV[key] = value;
  }
});

const browserEnvDefine: Record<string, string> = Object.fromEntries(
  Object.entries(BROWSER_VARIABLES_ENV).map(([key, value]) => [
    `import.meta.env.${key}`,
    JSON.stringify(value),
  ]),
);

const PATH_RESOLUTION_BANNER = `
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
process.env.NODE_ENV = process.env.NODE_ENV || '${PRODUCTION ? "production" : "development"}';
`.trim();

const getServiceWorkerDefine = (options?: {
  swVersion?: string | number;
  swResources?: string[];
  production?: boolean;
}): Record<string, string> => {
  const define: Record<string, string> = {};
  if (options?.swVersion != null) {
    define["SW_VERSION_INJECTED"] = JSON.stringify(String(options.swVersion));
  }
  if (options?.swResources != null) {
    define["SW_RESOURCES_INJECTED"] = JSON.stringify(
      JSON.stringify(options.swResources),
    );
  }
  define["SW_NODE_ENV_INJECTED"] = JSON.stringify(
    options?.production ? "production" : "development",
  );
  return define;
};

const staticallyStylePage = (html: string, ssg: string) => {
  return html.replace(
    "</head>",
    `<style id="ssg-css">${ssg}\nhtml{opacity:1;}</style>\n</head>`,
  );
};

const EDITOR_GLOBAL_CSS_FILES = [
  `${indir}/modules/spark-editor/styles/normalize/normalize.css`,
  `${indir}/modules/spark-editor/styles/theme/theme.css`,
];
const readEditorGlobalCss = (): string =>
  EDITOR_GLOBAL_CSS_FILES.map((f) =>
    fs.readFileSync(path.resolve(process.cwd(), f), "utf-8"),
  ).join("\n");

const viteStaticallyRenderedPagesPlugin = (): Plugin => ({
  name: "vite-statically-rendered-pages",
  configureServer(server) {
    const outDevDir = path.resolve(process.cwd(), outdir, ".dev");
    fs.mkdirSync(outDevDir, { recursive: true });

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
        }
      }
    };
    server.httpServer?.once("close", killWorkerProcs);
    process.once("exit", killWorkerProcs);

    let acceptReloads = false;
    setTimeout(() => {
      acceptReloads = true;
    }, 3000);
    let reloadTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleReload = () => {
      if (!acceptReloads) return;
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

    const assetMirrorRoot = path.join(outDevDir, "asset-mirror");
    const assetMirrorManifestPath = path.join(
      assetMirrorRoot,
      ".manifests.json",
    );
    let assetMirrorManifests: Record<string, Record<string, string>> = {};
    try {
      assetMirrorManifests = JSON.parse(
        fs.readFileSync(assetMirrorManifestPath, "utf-8"),
      );
    } catch {
    }
    const saveAssetMirrorManifest = () => {
      fs.mkdirSync(assetMirrorRoot, { recursive: true });
      fs.writeFileSync(
        assetMirrorManifestPath,
        JSON.stringify(assetMirrorManifests),
      );
    };
    const validClientId = (id: string | null | undefined): string | undefined =>
      id && /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : undefined;
    const manifestForClient = (client: string): Record<string, string> => {
      const cached = assetMirrorManifests[client];
      if (cached) {
        return cached;
      }
      const bucket = path.join(assetMirrorRoot, client);
      const rebuilt: Record<string, string> = {};
      const walk = (dir: string, prefix: string) => {
        let entries: fs.Dirent[];
        try {
          entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
          return;
        }
        for (const e of entries) {
          const rel = prefix ? `${prefix}/${e.name}` : e.name;
          const abs = path.join(dir, e.name);
          if (e.isDirectory()) {
            walk(abs, rel);
          } else {
            const st = fs.statSync(abs);
            rebuilt[rel] = `${Math.round(st.mtimeMs)}-${st.size}`;
          }
        }
      };
      walk(bucket, "");
      if (Object.keys(rebuilt).length > 0) {
        assetMirrorManifests[client] = rebuilt;
        saveAssetMirrorManifest();
      }
      return rebuilt;
    };
    const MIRROR_MIME: Record<string, string> = {
      png: "image/png",
      webp: "image/webp",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      svg: "image/svg+xml",
      ogg: "audio/ogg",
      mp3: "audio/mpeg",
      wav: "audio/wav",
      mid: "audio/midi",
      ttf: "font/ttf",
      otf: "font/otf",
      woff: "font/woff",
      woff2: "font/woff2",
      txt: "text/plain",
      json: "application/json",
      sd: "text/plain",
    };
    const filteredSvgMirrorCache = new Map<string, string>();
    const morphMirrorService = new MorphBakeService();
    const thumbnailMirrorCache = new Map<string, Buffer>();
    let sharpModule: Promise<any> | undefined;
    const loadSharp = () =>
      (sharpModule ??= import("sharp").then(
        (m) => m.default ?? m,
        () => undefined,
      ));
    const resolveMirrorPath = (
      client: string,
      rel: string,
    ): string | undefined => {
      const bucket = path.resolve(assetMirrorRoot, client);
      const abs = path.resolve(bucket, rel);
      if (!abs.startsWith(bucket + path.sep)) {
        return undefined;
      }
      return abs;
    };
    const clientFromCookie = (req: {
      headers: Record<string, any>;
    }): string | undefined => {
      const raw = String(req.headers["cookie"] ?? "");
      const match = raw.match(/(?:^|;\s*)devAssetMirrorClient=([^;]+)/);
      return validClientId(match?.[1]);
    };
    server.middlewares.use(async (req, res, next) => {
      try {
        if (!req.url) return next();
        const [rawPath, query] = req.url.split("?");
        const url = decodeURIComponent(rawPath ?? "");

        if (url === "/__dev-asset-mirror/manifest" && req.method === "GET") {
          const client = validClientId(
            new URLSearchParams(query ?? "").get("client"),
          );
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          if (client) {
            res.setHeader(
              "Set-Cookie",
              `devAssetMirrorClient=${client}; Path=/; SameSite=Lax`,
            );
          }
          res.end(JSON.stringify(client ? manifestForClient(client) : {}));
          return;
        }

        if (url.startsWith("/__dev-asset-mirror/") && req.method === "GET") {
          const [client, ...restSegs] = url
            .replace("/__dev-asset-mirror/", "")
            .split("/");
          const validClient = validClientId(client);
          const abs = validClient
            ? resolveMirrorPath(validClient, restSegs.join("/"))
            : undefined;
          if (abs && fs.existsSync(abs) && fs.statSync(abs).isFile()) {
            const ext = path.extname(abs).slice(1).toLowerCase();
            res.statusCode = 200;
            res.setHeader(
              "Content-Type",
              MIRROR_MIME[ext] ?? "application/octet-stream",
            );
            res.end(fs.readFileSync(abs));
            return;
          }
          res.statusCode = 404;
          res.end("not mirrored");
          return;
        }

        if (url.startsWith("/__dev-asset-mirror/") && req.method === "PUT") {
          const [client, ...restSegs] = url
            .replace("/__dev-asset-mirror/", "")
            .split("/");
          const validClient = validClientId(client);
          const rel = restSegs.join("/");
          const abs = validClient
            ? resolveMirrorPath(validClient, rel)
            : undefined;
          if (!validClient || !abs) {
            res.statusCode = 400;
            res.end("bad path");
            return;
          }
          const tag = new URLSearchParams(query ?? "").get("v") ?? "";
          const chunks: Buffer[] = [];
          req.on("data", (c: Buffer) => chunks.push(c));
          req.on("end", () => {
            fs.mkdirSync(path.dirname(abs), { recursive: true });
            fs.writeFileSync(abs, Buffer.concat(chunks));
            assetMirrorManifests[validClient] ??= {};
            assetMirrorManifests[validClient]![rel] = tag;
            saveAssetMirrorManifest();
            res.setHeader(
              "Set-Cookie",
              `devAssetMirrorClient=${validClient}; Path=/; SameSite=Lax`,
            );
            res.statusCode = 200;
            res.end("ok");
          });
          req.on("error", () => {
            res.statusCode = 500;
            res.end("upload failed");
          });
          return;
        }

        if (url.startsWith("/file:/") && req.method === "GET") {
          const rel = url.replace("/file:/", "");
          const client = clientFromCookie(req as any);
          const abs = client ? resolveMirrorPath(client, rel) : undefined;
          if (abs && fs.existsSync(abs) && fs.statSync(abs).isFile()) {
            const ext = path.extname(abs).slice(1).toLowerCase();
            const mime = MIRROR_MIME[ext] ?? "application/octet-stream";
            const params = new URLSearchParams(query ?? "");
            const thumbParam = params.get("thumb");
            const isRaster =
              mime.startsWith("image/") && mime !== "image/svg+xml";
            if (thumbParam && isRaster) {
              const sharp = await loadSharp();
              if (sharp) {
                try {
                  const width = clampThumbnailWidth(thumbParam);
                  const stat = fs.statSync(abs);
                  const cacheKey = `${rel}?thumb=${width}&sig=${stat.mtimeMs}-${stat.size}`;
                  let thumb = thumbnailMirrorCache.get(cacheKey);
                  if (!thumb) {
                    thumb = (await sharp(fs.readFileSync(abs))
                      .resize({ width, height: width, fit: "inside" })
                      .webp({ quality: 75 })
                      .toBuffer()) as Buffer;
                    thumbnailMirrorCache.set(cacheKey, thumb);
                  }
                  res.statusCode = 200;
                  res.setHeader("Content-Type", "image/webp");
                  res.setHeader(
                    "Cache-Control",
                    "max-age=31536000, immutable",
                  );
                  res.end(thumb);
                  return;
                } catch {
                }
              }
            }
            const morphRequest =
              ext === "svg" ? parseMorphAssetRequest(params) : undefined;
            if (morphRequest) {
              let response: Response;
              if (morphRequest === "invalid") {
                response = new Response("Unreadable morph request", { status: 400 });
              } else {
                const stat = fs.statSync(abs);
                response = await serveMorphAsset({
                  service: morphMirrorService,
                  path: rel,
                  file: new File([fs.readFileSync(abs, "utf-8")], path.basename(abs), {
                    type: "image/svg+xml",
                    lastModified: stat.mtimeMs,
                  }),
                  request: morphRequest,
                });
              }
              res.statusCode = response.status;
              response.headers.forEach((value, name) => res.setHeader(name, value));
              res.end(await response.text());
              return;
            }
            if (ext === "svg") {
              const filtersParam = params.get("attributes");
              const filter = filtersParam
                ? parseImageFilterParam(filtersParam)
                : undefined;
              const canonical = filter
                ? serializeImageFilterParam(filter)
                : undefined;
              if (filter && canonical) {
                const stat = fs.statSync(abs);
                const cacheKey = `${rel}?attributes=${canonical}&sig=${stat.mtimeMs}-${stat.size}`;
                let filtered = filteredSvgMirrorCache.get(cacheKey);
                if (filtered === undefined) {
                  filtered = filterSVG(fs.readFileSync(abs, "utf-8"), filter);
                  filteredSvgMirrorCache.set(cacheKey, filtered);
                }
                res.statusCode = 200;
                res.setHeader("Content-Type", "image/svg+xml");
                res.setHeader("Cache-Control", "max-age=31536000, immutable");
                res.end(filtered);
                return;
              }
            }
            res.statusCode = 200;
            res.setHeader("Content-Type", mime);
            res.setHeader("Cache-Control", "max-age=31536000, immutable");
            res.end(fs.readFileSync(abs));
            return;
          }
        }
      } catch (err) {
        console.error("dev-asset-mirror middleware error", err);
      }
      return next();
    });

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
              res.setHeader("Cache-Control", "no-store");
              res.end(fs.readFileSync(filePath, "utf-8"));
              return;
            }
          } else if (!isMap) {
            const SW_VERSION = "dev";
            const swResourceSet = new Set(["/"]);
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
              define: getServiceWorkerDefine({
                swVersion: SW_VERSION,
                swResources: SW_RESOURCES,
                production: false,
              }),
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

        if (url.includes(".")) return next();

        const route =
          url === "/" ? "index" : url.replace(/^\//, "").replace(".html", "");
        const possibleHtmlPath = path.join(
          process.cwd(),
          "src",
          "pages",
          `${route}.html`,
        );

        if (!fs.existsSync(possibleHtmlPath)) return next();

        const preactRegistryModule = await server.ssrLoadModule(
          `/src/modules/spark-editor/preact-registry.ts`,
        );
        const rootComponent = preactRegistryModule.rootComponent;

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
          [readEditorGlobalCss(), impowerUiTailwindCss]
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

export {
  indir,
  outdir,
  apiInDir,
  apiOutDir,
  publicInDir,
  publicOutDir,
  pagesInDir,
  serviceWorkerPaths,
  externalWorkerPaths,
  alias,
  dedupe,
  ssrNoExternal,
  impowerUiStyleCss,
  PRODUCTION,
  WATCH,
  MINIFY,
  browserEnvDefine,
  PATH_RESOLUTION_BANNER,
  getServiceWorkerDefine,
  staticallyStylePage,
  readEditorGlobalCss,
  viteStaticallyRenderedPagesPlugin,
};

export default defineConfig({
  resolve: { alias, dedupe },
});
