import * as esbuild from "esbuild";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./esbuild.js";

const here = path.dirname(fileURLToPath(import.meta.url));

const result = await esbuild
  .build({
    ...config,
    absWorkingDir: here,
    entryPoints: ["./impowerUiEntries.probe.ts"],
    outfile: "impowerUiEntries.probe.js",
    write: false,
    sourcemap: false,
    minify: false,
    metafile: true,
    logLevel: "silent",
  })
  .catch((e) => {
    for (const error of e.errors ?? [e]) {
      console.error(`check-impower-ui-entries: ${error.text ?? error.message ?? error}`);
    }
    process.exit(1);
  });

const inputs = Object.keys(result.metafile.inputs).map((input) =>
  input.split(path.sep).join("/"),
);
const output = result.outputFiles.find((file) => file.path.endsWith(".js"))?.text ?? "";

const failures = [];
for (const required of [
  "packages/impower-ui/src/components/icon/icons.generated.tsx",
  "packages/impower-ui/src/components/index.ts",
  "node_modules/preact/jsx-runtime/",
  "node_modules/preact/compat/",
]) {
  if (!inputs.some((input) => input.includes(required))) {
    failures.push(`the bundle has no input from ${required}`);
  }
}
if (inputs.some((input) => input.includes("node_modules/react/"))) {
  failures.push("the bundle includes React instead of preact/compat");
}
if (output.includes("React.createElement")) {
  failures.push("the bundle compiles JSX with React's classic factory");
}

if (failures.length) {
  for (const failure of failures) console.error(`check-impower-ui-entries: ${failure}`);
  process.exit(1);
}
console.log(
  `check-impower-ui-entries: @impower/impower-ui/icons and /components build in the game webview (${inputs.length} inputs)`,
);
