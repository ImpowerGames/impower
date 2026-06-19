import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";

const PRODUCTION = process.env.NODE_ENV === "production";

/**
 * Honor Vite's `?raw` query inside the nested esbuild builds (the inline-worker
 * and dev-service-worker bundles). Vite itself supports `?raw` for the app
 * graph, but the *.worker.ts / sw.ts bundles are produced by standalone esbuild
 * calls that don't inherit Vite's loaders — without this plugin a `?raw` import
 * reachable from a worker would fail to resolve. Resolves a `*?raw` import to
 * the real file in a dedicated namespace, then loads it with the text loader.
 */
const rawPlugin = (): esbuild.Plugin => ({
  name: "raw",
  setup(build) {
    build.onResolve({ filter: /\?raw$/ }, (args) => {
      const target = args.path.slice(0, -4);
      return {
        path: path.isAbsolute(target)
          ? target
          : path.join(args.resolveDir, target),
        namespace: "raw-loader",
      };
    });
    build.onLoad({ filter: /.*/, namespace: "raw-loader" }, (args) => ({
      contents: fs.readFileSync(args.path, "utf8"),
      loader: "text",
    }));
  },
});

function viteInlineWorkerPlugin(extraConfig?: esbuild.BuildOptions): Plugin {
  return {
    name: "vite-inline-worker",
    async transform(_, id) {
      if (/\.worker\.(?:ts|js)$/.test(id)) {
        const result = await esbuild.build({
          entryPoints: [id],
          write: false,
          bundle: true,
          minify: PRODUCTION,
          format: "esm",
          target: "esnext",
          plugins: [rawPlugin()],
          ...(extraConfig || {}),
          // Emit a metafile so we can watch the worker's transitively-bundled
          // deps. esbuild bundles them opaquely, so without this Vite only
          // tracks the .worker.ts entry and serves a stale bundle when
          // engine/compiler code changes — forcing a full dev-server restart.
          metafile: true,
        });

        // Register every bundled SOURCE input as a watch dependency. Editing
        // any of them then invalidates + re-transforms this worker module, and
        // since nothing accepts the HMR update Vite falls back to a full reload
        // that re-instantiates the Worker with the fresh bundle. node_modules
        // inputs are skipped (they don't change in dev, and workspace packages
        // resolve to real packages/* paths via esbuild's symlink resolution, so
        // they're kept and stay watched).
        for (const input of Object.keys(result.metafile?.inputs ?? {})) {
          if (input.includes("node_modules")) {
            continue;
          }
          // esbuild lists namespaced inputs as `<namespace>:<path>` — e.g. a
          // `?raw` import resolved into the rawPlugin's `raw-loader` namespace.
          // Strip the namespace to recover the real file path; otherwise
          // path.resolve mangles `raw-loader:C:\…` into a bogus path that Vite's
          // import-analysis then fails to resolve. (The real file, e.g.
          // builtins.sd, still gets watched so editing it hot-reloads the worker.)
          const real = input.startsWith("raw-loader:")
            ? input.slice("raw-loader:".length)
            : input;
          this.addWatchFile(path.resolve(real));
        }

        let code = result.outputFiles?.[0]?.text || "";
        const exportIndex = code.lastIndexOf("export");
        if (exportIndex >= 0) code = code.slice(0, exportIndex);

        return {
          code: `export default ${JSON.stringify(code)};`,
          map: null,
        };
      }
      return null;
    },
  };
}

function devServiceWorkerPlugin(options: {
  entry: string;
  outfile: string;
}): Plugin {
  let code = "";
  let map = "";
  let absEntry = "";

  return {
    name: "vite-plugin-dev-service-worker",
    apply: "serve", // dev only
    configResolved(cfg) {
      absEntry = path.resolve(cfg.root, options.entry);
    },
    async configureServer(server) {
      // initial build
      const ctx = await esbuild.context({
        entryPoints: [absEntry],
        bundle: true,
        format: "esm",
        platform: "browser",
        sourcemap: "inline",
        write: false,
        plugins: [rawPlugin()],
      });
      let result = await ctx.rebuild();
      code = result.outputFiles?.[0]?.text ?? "";
      map = result.outputFiles?.[1]?.text ?? "";

      // rebuild on change
      server.watcher.add(absEntry);
      server.watcher.on("change", async (file) => {
        if (file === absEntry) {
          result = await ctx.rebuild();
          code = result.outputFiles?.[0]?.text ?? "";
          map = result.outputFiles?.[1]?.text ?? "";
          server.ws.send({ type: "full-reload" });
        }
      });

      // serve /sw.js
      server.middlewares.use((req, res, next) => {
        if (req.url === `/${options.outfile}`) {
          res.setHeader(
            "Content-Type",
            "application/javascript; charset=utf-8",
          );
          res.end(code);
          return;
        }
        if (req.url === `/${options.outfile}.map` && map) {
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(map);
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // DEV-ONLY same-origin game preview. When VITE_SAME_ORIGIN_PREVIEW is set, the
  // editor reverse-proxies this dev server under its own origin at /__player/
  // (see impower-dev/build.ts). Serving under base "/__player/" makes the
  // emitted HTML/asset URLs (/__player/@vite/client, /__player/src/main.ts, …)
  // route back through that proxy. HMR connects directly to this server's port
  // (not through the proxy) so no websocket proxying is needed. Defaults OFF
  // (base "/"). Gated on `mode !== "production"` so an ambient flag can never
  // flip a prod build onto the /__player/ base.
  const env = loadEnv(mode, process.cwd(), "");
  const SAME_ORIGIN_PREVIEW =
    mode !== "production" && !!env["VITE_SAME_ORIGIN_PREVIEW"];
  // Keep the served port and the HMR client port in one knob so they can't drift
  // (and so multiple worktrees can run players without colliding). The editor's
  // SPARKDOWN_PLAYER_DEV_ORIGIN must point at this same port.
  const PLAYER_PORT = Number(env["SPARKDOWN_PLAYER_PORT"] || 5173);
  return {
  base: SAME_ORIGIN_PREVIEW ? "/__player/" : "/",
  server: {
    host: true,
    ...(SAME_ORIGIN_PREVIEW
      ? { port: PLAYER_PORT, hmr: { clientPort: PLAYER_PORT } }
      : {}),
  },
  // Use Preact's automatic JSX runtime for the .tsx in spark-web-player.
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "preact",
  },
  resolve: {
    // Single preact instance across the workspace.
    dedupe: ["preact", "preact-custom-element"],
  },
  plugins: [
    viteInlineWorkerPlugin(),
    devServiceWorkerPlugin({
      entry: "src/workers/sw.ts",
      outfile: "sw.js",
    }),
  ],
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        sw: "src/workers/sw.ts",
      },
      output: {
        entryFileNames(chunk) {
          return chunk.name === "sw" ? "sw.js" : "assets/[name]-[hash].js";
        },
      },
    },
  },
  };
});
