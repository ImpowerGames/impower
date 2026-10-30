import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";

const PRODUCTION = process.env.NODE_ENV === "production";

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
          metafile: true,
        });

        for (const input of Object.keys(result.metafile?.inputs ?? {})) {
          if (input.includes("node_modules")) {
            continue;
          }
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
    apply: "serve",
    configResolved(cfg) {
      absEntry = path.resolve(cfg.root, options.entry);
    },
    async configureServer(server) {
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

      server.watcher.add(absEntry);
      server.watcher.on("change", async (file) => {
        if (file === absEntry) {
          result = await ctx.rebuild();
          code = result.outputFiles?.[0]?.text ?? "";
          map = result.outputFiles?.[1]?.text ?? "";
          server.ws.send({ type: "full-reload" });
        }
      });

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
  const env = loadEnv(mode, process.cwd(), "");
  const SAME_ORIGIN_PREVIEW =
    mode !== "production" && !!env["VITE_SAME_ORIGIN_PREVIEW"];
  const PLAYER_PORT = Number(env["SPARKDOWN_PLAYER_PORT"] || 5173);
  return {
  base: SAME_ORIGIN_PREVIEW ? "/__player/" : "/",
  server: {
    host: true,
    ...(SAME_ORIGIN_PREVIEW
      ? { port: PLAYER_PORT, hmr: { clientPort: PLAYER_PORT } }
      : {}),
  },
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "preact",
  },
  resolve: {
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
