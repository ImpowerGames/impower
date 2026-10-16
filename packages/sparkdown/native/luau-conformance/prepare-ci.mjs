// Shared by the focused native workflow and the Sparkdown package-suite job.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.CI !== "true" || process.platform !== "linux" || !process.env.RUNNER_TEMP)
  throw Error("prepare-ci.mjs is only for Linux CI; local builds reuse the existing pinned source/SDK");
const root = dirname(fileURLToPath(import.meta.url));
const temporary = process.env.RUNNER_TEMP;
const source = join(temporary, "luau-conformance-source");
const sdk = join(temporary, "luau-conformance-emsdk");
function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) throw Error(`${command} failed (${result.status ?? result.error})`);
}
if (!existsSync(source)) {
  run("git", ["clone", "https://github.com/luau-lang/luau.git", source]);
  run("git", ["-C", source, "checkout", "--detach", "7d5f73364fdbbaa984fa545071630eba73cfea98"]);
}
if (!existsSync(sdk)) run("git", ["clone", "https://github.com/emscripten-core/emsdk.git", sdk]);
run("python3", [join(sdk, "emsdk.py"), "install", "4.0.10"]);
run("python3", [join(sdk, "emsdk.py"), "activate", "4.0.10"]);
// build.mjs independently verifies pin, tracked cleanliness, SDK and all cache/artifact hashes.
run(process.execPath, [join(root, "build.mjs"), source, sdk, join(temporary, "luau-conformance-objects")]);
