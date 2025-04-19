import { exec } from "child_process";
import * as chokidar from "chokidar";
import esbuild from "esbuild";
import fs from "fs";
import path from "path";

const PRODUCTION = process.argv.includes("--production");
const WATCH = process.argv.includes("--watch");

const LOG_PREFIX =
  (WATCH ? "[watch] " : "") + `${path.basename(process.cwd())}: `;

const SPARK_WEB_PLAYER_SRC_PATH = "../../../packages/spark-web-player/src";

const DECLARATIONS_PATH = "../../../packages/spark-web-player/types/types.d.ts";

const esbuildInlineTextPlugin = (): esbuild.Plugin => ({
  name: "esbuild-inline-text",
  setup(build) {
    build.onLoad({ filter: /\.text\.(?:ts|js)$/ }, (args) => {
      if (!fs.existsSync(DECLARATIONS_PATH)) {
        console.error(
          `[PLUGIN ERROR] Declaration file not found: ${DECLARATIONS_PATH}`
        );
      }
      const contents = fs.readFileSync(DECLARATIONS_PATH, "utf-8");
      console.log(
        LOG_PREFIX + `loaded inline text contents (${contents.length})`
      );
      return {
        contents,
        loader: "text",
      };
    });
  },
});

const esbuildProblemMatcher = (): esbuild.Plugin => ({
  name: "esbuildProblemMatcher",
  setup(build) {
    build.onStart(() => {
      console.log(LOG_PREFIX + `build started`);
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        if (location == null) return;
        console.error(
          `    ${location.file}:${location.line}:${location.column}:`
        );
      });
      console.log(LOG_PREFIX + `build finished`);
    });
  },
});

const config: esbuild.BuildOptions = {
  bundle: true,
  minify: PRODUCTION,
  sourcemap: !PRODUCTION,
  target: "node16",
  platform: "node",
  format: "cjs",
  entryPoints: ["./index.ts"],
  outfile: "dist/index.js",
  plugins: [esbuildInlineTextPlugin(), esbuildProblemMatcher()],
};

async function main() {
  const ctx = await esbuild.context(config);
  if (WATCH) {
    await ctx.watch();
    const rebuild = async (ctx) => {
      console.log(
        LOG_PREFIX +
          `detected change in ${SPARK_WEB_PLAYER_SRC_PATH}, rebuilding...`
      );
      await ctx.rebuild();
    };
    chokidar
      .watch(SPARK_WEB_PLAYER_SRC_PATH, {
        ignoreInitial: true,
        persistent: true,
        depth: 99,
      })
      .on("all", async () => {
        await new Promise<void>((resolve) => {
          exec(`npm run build`, (error, _stdout, stderr) => {
            if (error) {
              console.error(error);
            }
            if (stderr) {
              console.error(stderr);
            }
            resolve();
          });
        });
        rebuild(ctx);
      });
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
