import * as esbuild from "esbuild";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";

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
            "application/javascript; charset=utf-8"
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
  plugins: [
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
