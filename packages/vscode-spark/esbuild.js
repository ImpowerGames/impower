const { build } = require("esbuild");
const { copy } = require("esbuild-plugin-copy");

let fallbackPlugin = {
  name: "env",
  setup(build) {
    const replace = {
      assert: require.resolve("assert/"),
      buffer: require.resolve("buffer/"),
      child_process: false,
      crypto: false,
      fs: false,
      os: require.resolve("os-browserify/browser"),
      path: require.resolve("path-browserify"),
      stream: require.resolve("readable-stream"),
      util: require.resolve("util/"),
      zlib: require.resolve("browserify-zlib"),
    };
    const filter = RegExp(`^(${Object.keys(replace).join("|")})$`);
    build.onResolve({ filter }, (arg) => ({
      path: replace[arg.path],
    }));
  },
};

//@ts-check
/** @typedef {import('esbuild').BuildOptions} BuildOptions **/

/** @type BuildOptions */
const baseConfig = {
  bundle: true,
  minify: process.env.NODE_ENV === "production",
  sourcemap: process.env.NODE_ENV !== "production",
  loader: {
    ".html": "text",
    ".css": "text",
    ".svg": "text",
  },
};

// Config for extension source code (to be run in a Node-based context)
/** @type BuildOptions */
const extensionConfig = {
  ...baseConfig,
  platform: "node",
  format: "cjs",
  entryPoints: ["./src/extension.ts"],
  outfile: "./out/extension.js",
  external: ["vscode"],
};

// Config for webview source code (to be run in a web-based context)
/** @type BuildOptions */
const webviewConfig = {
  ...baseConfig,
  target: "es2020",
  format: "esm",
  entryPoints: ["./src/main.ts"],
  outfile: "./out/main.js",
  plugins: [
    fallbackPlugin,
    // Copy assets to `out` directory unaltered
    copy({
      resolveFrom: "cwd",
      assets: {
        from: ["./assets/**"],
        to: ["./out"],
      },
    }),
  ],
};

// This watch config adheres to the conventions of the esbuild-problem-matchers
// extension (https://github.com/connor4312/esbuild-problem-matchers#esbuild-via-js)
/** @type BuildOptions */
const watchConfig = {
  watch: {
    onRebuild(error, result) {
      console.log("[watch] build started");
      if (error) {
        error.errors.forEach((error) =>
          console.error(
            `> ${error.location.file}:${error.location.line}:${error.location.column}: error: ${error.text}`
          )
        );
      } else {
        console.log("[watch] build finished");
      }
    },
  },
};

// Build script
(async () => {
  const args = process.argv.slice(2);
  try {
    if (args.includes("--watch")) {
      // Build and watch extension and webview code
      console.log("[watch] build started");
      await build({
        ...extensionConfig,
        ...watchConfig,
      });
      await build({
        ...webviewConfig,
        ...watchConfig,
      });
      console.log("[watch] build finished");
    } else {
      // Build extension and webview code
      await build(extensionConfig);
      await build(webviewConfig);
    }
  } catch (err) {
    process.stderr.write(err.stderr);
    process.exit(1);
  }
})();
