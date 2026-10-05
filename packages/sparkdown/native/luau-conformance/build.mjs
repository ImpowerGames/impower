import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, copyFileSync, openSync, closeSync, unlinkSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileProfile, assertionPolicy, compileFlags } from "./compile-profile.mjs";

const PIN = "7d5f73364fdbbaa984fa545071630eba73cfea98";
const root = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const planOnly = args.includes("--plan");
const positional = args.filter(arg => arg !== "--plan");
if (positional.length < 3 || positional.length > 4)
  throw Error("Usage: node build.mjs <clean pinned source> <Emscripten4.0.10 SDK> <object cache> [generated output] [--plan]");
const [source, sdk, cache] = positional.slice(0, 3).map(path => resolve(path));
const output = resolve(positional[3] ?? join(root, "generated"));
const windows = process.platform === "win32";
const python = windows ? join(sdk, "python/3.13.3_64bit/python.exe") : "python3";
const compiler = join(sdk, "upstream/emscripten/em++.py");
const env = { ...process.env, EM_CONFIG: join(sdk, ".emscripten") };
function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, ...options });
  if (result.status !== 0) throw Error(`${command} failed (${result.status}): ${result.stderr ?? result.error}\n${result.stdout}`);
  return result.stdout.trim();
}
const hashBytes = bytes => createHash("sha256").update(bytes).digest("hex");
const hashFile = path => hashBytes(readFileSync(path));
if (run("git", ["-C", source, "rev-parse", "HEAD"]) !== PIN) throw Error("Incorrect Luau source pin");
if (run("git", ["-C", source, "status", "--porcelain", "--untracked-files=no"])) throw Error("Pinned source has tracked modifications");
const version = run(python, [compiler, "--version"], { env });
if (!version.includes("4.0.10")) throw Error("Emscripten must be4.0.10");
const binarySuffix = windows ? ".exe" : "";
const tools = Object.fromEntries([
  "upstream/emscripten/em++.py", "upstream/emscripten/emcc.py", "upstream/emscripten/src/settings.js",
  `upstream/bin/clang${binarySuffix}`, `upstream/bin/wasm-ld${binarySuffix}`,
].map(path => [path, hashFile(join(sdk, path))]));
const targets = ["Common", "Ast", "Bytecode", "Compiler", "Config", "VM", "Analysis"];
const sourcesCmake = readFileSync(join(source, "Sources.cmake"), "utf8");
const upstreamSources = [];
for (const target of targets) {
  const start = sourcesCmake.indexOf(`target_sources(Luau.${target} PRIVATE`);
  if (start < 0) throw Error(`Missing upstream target ${target}`);
  const end = sourcesCmake.indexOf("\n)", start);
  if (end < 0) throw Error(`Unterminated upstream target ${target}`);
  const block = sourcesCmake.slice(start, end).split("\n").slice(1).join("\n");
  upstreamSources.push(...block.split(/\s+/).filter(path => path.endsWith(".cpp")));
}
upstreamSources.push("tests/Fixture.cpp");
// Conservatively include every tracked upstream C++ header/source. A changed dependency
// invalidates the cache even if a compiler's dependency scanner would miss it.
const upstreamInputs = run("git", ["-C", source, "ls-files"]).split("\n")
  .filter(path => path === "Sources.cmake" || path.endsWith(".h") || path.endsWith(".hpp") ||
    path.endsWith(".inl") || path.endsWith(".cpp") || path.endsWith(".c"));
const inputHashes = Object.fromEntries(upstreamInputs.map(path => [path, hashFile(join(source, path))]));
// Uniform for ALL upstream and owned objects. This is an optimized Luau-assert
// profile, not the full non-NDEBUG CMake Debug layout or a production artifact.
// Exact Luau.UnitTest target definitions from pinned CMakeLists.txt:300. They
// affect only the fixture/adapter TUs, never production Analysis/Compiler/VM objects.
const fixtureCompileFlags = ["-DDOCTEST_CONFIG_DOUBLE_STRINGIFY", "-DDOCTEST_CONFIG_USE_STD_HEADERS"];
const includes = [...targets.map(target => `${target}/include`), "VM/src", "tests", "extern"];
const includeFlags = includes.map(path => `-I${join(source, path)}`);
const linkFlags = ["-fexceptions", "-sMODULARIZE=1", "-sEXPORT_ES6=1", "-sENVIRONMENT=web,worker,node",
  "-sEXPORT_NAME=createLuauConformance", "-sALLOW_MEMORY_GROWTH=1", "-sMAXIMUM_MEMORY=268435456",
  "-sINITIAL_MEMORY=16777216", "-sSTACK_SIZE=2097152", "-sDISABLE_EXCEPTION_CATCHING=0",
  "-sABORTING_MALLOC=0", "-sERROR_ON_UNDEFINED_SYMBOLS=1", '-sEXPORTED_RUNTIME_METHODS=["ccall","writeArrayToMemory"]'];
const baseIdentity = { pin: PIN, version, tools, compileProfile, assertionPolicy, compileFlags, includes, upstreamSources, inputHashes };
const cacheKey = hashBytes(JSON.stringify(baseIdentity));
// Keep production/Fixture cache identity stable; added fixture TUs have their own
// exact path+defines object identity and are also covered by inputHashes above.
const fixtureSources = ["tests/ClassFixture.cpp"];
const allSources = [...upstreamSources, ...fixtureSources];
const owned = ["session.h", "session.cpp", "bridge.cpp", "fixture-runtime.cpp", "build.mjs", "compile-profile.mjs"];
const ownedHashes = Object.fromEntries(owned.map(path => [path, hashFile(join(root, path))]));
const cacheRoot = join(cache, cacheKey);
const objectPath = path => join(cacheRoot, hashBytes(path.startsWith("tests/") ?
  JSON.stringify({ path, fixtureCompileFlags }) : path) + ".o");
function validObject(path) {
  const object = objectPath(path), marker = `${object}.sha256`;
  return existsSync(object) && existsSync(marker) && readFileSync(marker, "utf8") === hashFile(object);
}
const missing = allSources.filter(path => !validObject(path));
const plan = { pin: PIN, cacheKey, output, workers: 1, upstreamObjectCount: allSources.length,
  uncachedObjectCount: missing.length, fixtureSources, ownedHashes, compileProfile, assertionPolicy, compileFlags, fixtureCompileFlags, includes, linkFlags };
console.log(JSON.stringify({ phase: "plan", ...plan }, null, 2));
if (planOnly) process.exit(0);
mkdirSync(cacheRoot, { recursive: true });
mkdirSync(output, { recursive: true });
const lock = join(cacheRoot, "build.lock");
const lockFile = openSync(lock, "wx");
writeFileSync(lockFile, JSON.stringify({ pid: process.pid, started: new Date().toISOString(), output }));
try {
const compile = (path, object, extra = []) => run(python, [compiler, ...compileFlags, ...extra, ...includeFlags, "-c", path, "-o", object], { env });
const started = performance.now();
for (const [index, path] of missing.entries()) {
  const object = objectPath(path), temporary = `${object}.tmp-${process.pid}`;
  console.log(JSON.stringify({ phase: "compile", source: path, index: index + 1, total: missing.length }));
  compile(join(source, path), temporary, path.startsWith("tests/") ? fixtureCompileFlags : []);
  renameSync(temporary, object);
  writeFileSync(`${object}.sha256`, hashFile(object));
}
const objects = allSources.map(objectPath);
for (const path of ["session.cpp", "bridge.cpp", "fixture-runtime.cpp"]) {
  const object = join(output, path + ".o");
  compile(join(root, path), object, fixtureCompileFlags);
  objects.push(object);
}
// Response files contain compiler arguments, never shell commands.
const response = join(output, "link.rsp");
const link = ["-O2", ...objects, ...linkFlags, "-o", join(output, "backend.js")];
writeFileSync(response, link.map(arg => JSON.stringify(arg.replaceAll("\\", "/"))).join("\n"));
run(python, [compiler, `@${response}`], { env });
copyFileSync(join(source, "LICENSE.txt"), join(output, "LICENSE.txt"));
for (const path of ["backend.js", "LICENSE.txt"])
  writeFileSync(join(output, path), readFileSync(join(output, path), "utf8").replaceAll("\r\n", "\n"));
const artifacts = Object.fromEntries(["backend.js", "backend.wasm", "LICENSE.txt"].map(path =>
  [path, { sha256: hashFile(join(output, path)), bytes: readFileSync(join(output, path)).length }]));
for (const [path, expected] of Object.entries(inputHashes))
  if (hashFile(join(source, path)) !== expected) throw Error(`Upstream input changed during build: ${path}`);
for (const [path, expected] of Object.entries(ownedHashes))
  if (hashFile(join(root, path)) !== expected) throw Error(`Adapter input changed during build: ${path}`);
for (const [path, expected] of Object.entries(tools))
  if (hashFile(join(sdk, path)) !== expected) throw Error(`Compiler tool changed during build: ${path}`);
const manifest = { abi: 1, instrumentation: "native-fixture-only", ...baseIdentity, cacheKey, ownedHashes, fixtureCompileFlags, linkFlags,
  fixtureSources,
  objectHashes: Object.fromEntries(objects.map((path, index) => [index, hashFile(path)])), artifacts,
  textNormalization: "LF", workers: 1, buildMs: performance.now() - started };
writeFileSync(join(output, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify({ phase: "complete", artifacts, buildMs: manifest.buildMs }));
} finally {
  closeSync(lockFile);
  unlinkSync(lock);
}
