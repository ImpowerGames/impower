// Build the Luau.Web WASM module by:
//   1. Cloning luau-lang/luau into vendor/luau (shallow) if not already there.
//   2. Running the official emscripten/emsdk Docker image to invoke
//      `emcmake cmake` + `emmake make Luau.Web`.
//   3. Copying the produced single-file ES module into src/wasm/Luau.Web.js
//      so Vite can import it.
//
// Requires Docker to be installed and running. The emscripten/emsdk image is
// ~1.5GB on first pull and is cached locally afterwards.

import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(__dirname, "..");
const VENDOR_DIR = join(PACKAGE_ROOT, "vendor");
const LUAU_DIR = join(VENDOR_DIR, "luau");
const WASM_OUT_DIR = join(PACKAGE_ROOT, "src", "wasm");

// Pin to a known-good Luau release. Bump as needed; main is also fine.
const LUAU_REF = process.env.LUAU_REF ?? "0.661";
const LUAU_REPO = "https://github.com/luau-lang/luau.git";

const EMSDK_IMAGE = process.env.EMSDK_IMAGE ?? "emscripten/emsdk:3.1.74";

function run(cmd, args, opts = {}) {
  const pretty = [cmd, ...args].join(" ");
  console.log(`\n$ ${pretty}`);
  const result = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${pretty}`);
  }
}

function tryRun(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { stdio: "pipe", ...opts });
  return result.status === 0;
}

function ensureDocker() {
  process.stdout.write("Checking Docker … ");
  if (!tryRun("docker", ["--version"])) {
    process.stdout.write("not installed\n");
    throw new Error(
      "Docker is not installed or not on PATH. Install Docker Desktop from https://www.docker.com/products/docker-desktop/."
    );
  }
  // On Windows, `docker info` blocks indefinitely when the daemon isn't
  // running (it waits on the named pipe). Use a hard timeout so we fail
  // fast with a useful message instead of looking hung.
  const probe = spawnSync("docker", ["info", "--format", "{{.ServerVersion}}"], {
    stdio: "pipe",
    timeout: 8000,
    killSignal: "SIGKILL",
  });
  if (probe.status !== 0 || probe.signal) {
    process.stdout.write("daemon unreachable\n");
    throw new Error(
      "Docker is installed but the daemon is not responding. " +
        "Start Docker Desktop (wait until the whale icon stops animating) and re-run `npm run build:wasm`."
    );
  }
  process.stdout.write(`ok (server ${probe.stdout.toString().trim()})\n`);
}

function ensureLuauSources() {
  if (!existsSync(VENDOR_DIR)) mkdirSync(VENDOR_DIR, { recursive: true });
  if (existsSync(join(LUAU_DIR, ".git"))) {
    console.log(`Luau sources already present at ${LUAU_DIR}`);
    return;
  }
  console.log(`Cloning ${LUAU_REPO} @ ${LUAU_REF} into vendor/luau …`);
  run("git", [
    "clone",
    "--depth",
    "1",
    "--branch",
    LUAU_REF,
    LUAU_REPO,
    LUAU_DIR,
  ]);
}

function buildInDocker() {
  // We mount the luau source tree at /src and run the build inside the
  // container. The build directory lives inside the container (not on the
  // host) so we copy the final artifact out via `docker cp` after the build.
  //
  // We pass extra link flags via CMAKE_EXE_LINKER_FLAGS to convert the
  // single-file output into an ES6 module that Vite can import:
  //   - MODULARIZE=1 / EXPORT_ES6=1: emits `export default createLuauModule`
  //   - EXPORT_NAME: the factory's name
  //   - ENVIRONMENT=web,worker: skip Node.js polyfills for smaller output
  const linkerFlags = [
    "-sMODULARIZE=1",
    "-sEXPORT_ES6=1",
    "-sEXPORT_NAME=createLuauModule",
    "-sENVIRONMENT=web,worker",
    // The Luau target already sets SINGLE_FILE=1 in its CMakeLists.
  ].join(" ");

  const containerName = `luau-wasm-build-${Date.now()}`;
  const buildScript = [
    "set -e",
    "cd /src",
    "rm -rf build",
    "emcmake cmake -B build" +
      " -DCMAKE_BUILD_TYPE=Release" +
      " -DLUAU_BUILD_WEB=ON" +
      " -DLUAU_BUILD_CLI=OFF" +
      " -DLUAU_BUILD_TESTS=OFF" +
      ` -DCMAKE_EXE_LINKER_FLAGS=\"${linkerFlags}\"`,
    "emmake make -C build Luau.Web -j$(nproc)",
    "ls -la build/Luau.Web.js",
  ].join(" && ");

  // Run the build. We can't bind-mount the build/ output to the host on
  // Windows reliably (path separators, permissions), so we use `docker cp`
  // after the container exits.
  try {
    run("docker", [
      "run",
      "--name",
      containerName,
      "-v",
      `${LUAU_DIR}:/src`,
      EMSDK_IMAGE,
      "bash",
      "-lc",
      buildScript,
    ]);

    if (!existsSync(WASM_OUT_DIR)) mkdirSync(WASM_OUT_DIR, { recursive: true });
    // The build artifact is inside the mounted volume, so it's already on the
    // host filesystem at LUAU_DIR/build/Luau.Web.js.
    const built = join(LUAU_DIR, "build", "Luau.Web.js");
    const dest = join(WASM_OUT_DIR, "Luau.Web.js");
    if (!existsSync(built)) {
      throw new Error(`Build succeeded but artifact not found at ${built}`);
    }
    copyFileSync(built, dest);
    console.log(`\nCopied → ${dest}`);
  } finally {
    spawnSync("docker", ["rm", "-f", containerName], { stdio: "ignore" });
  }
}

function main() {
  console.log("== Luau → WASM build ==");
  ensureDocker();
  ensureLuauSources();
  buildInDocker();
  console.log("\nDone. Run `npm run dev` to launch the demo.");
}

try {
  main();
} catch (err) {
  console.error(`\nbuild:wasm failed: ${err.message}`);
  process.exit(1);
}
