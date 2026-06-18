import * as esbuild from "esbuild";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";

const PRODUCTION = process.env.NODE_ENV === "production";

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
          this.addWatchFile(path.resolve(input));
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

export default defineConfig({
  server: {
    host: true,
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
});
