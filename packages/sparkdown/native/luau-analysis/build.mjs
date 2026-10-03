import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const PIN = "7d5f73364fdbbaa984fa545071630eba73cfea98";
const root = dirname(fileURLToPath(import.meta.url));
const [sourceArg, sdkArg, outputArg] = process.argv.slice(2);
if (!sourceArg || !sdkArg) throw Error("Usage: node build.mjs <clean Luau source> <Emscripten 4.0.10 SDK> [output]");
const source = resolve(sourceArg), sdk = resolve(sdkArg);
const output = resolve(outputArg ?? join(root, "../../vendor/luau-analysis"));
function run(command, args, options = {}) {
  const r = spawnSync(command, args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, ...options });
  if (r.status !== 0) throw Error(`${command} failed (${r.status}): ${r.stderr ?? r.error}\n${r.stdout}`);
  return r.stdout.trim();
}
if (run("git", ["-C", source, "rev-parse", "HEAD"]) !== PIN) throw Error("Incorrect Luau source pin");
if (run("git", ["-C", source, "status", "--porcelain", "--untracked-files=no"])) throw Error("Source has tracked modifications");
const env = { ...process.env, EM_CONFIG: join(sdk, ".emscripten") };
const windows = process.platform === "win32";
const python = windows ? join(sdk, "python/3.13.3_64bit/python.exe") : "python3";
const compiler = join(sdk, "upstream/emscripten/em++.py");
const version = run(python, [compiler, "--version"], { env });
if (!version.includes("4.0.10")) throw Error("Emscripten must be 4.0.10");
const sourcesCmake = readFileSync(join(source, "Sources.cmake"), "utf8");
const targets = ["Common", "Ast", "Bytecode", "Compiler", "Config", "VM", "Analysis"];
const sources = [];
for (const target of targets) {
  const block = sourcesCmake.match(new RegExp(`target_sources\\(Luau\\.${target} PRIVATE([\\s\\S]*?)\\n\\)`));
  if (!block) throw Error(`Missing upstream target ${target}`);
  sources.push(...block[1].trim().split(/\s+/).filter(p => p.endsWith(".cpp")).map(p => join(source, p)));
}
mkdirSync(output, { recursive: true });
const args = ["-std=c++17", "-O2", "-fexceptions", "-DNDEBUG", ...targets.map(t => `-I${join(source, t, "include")}`),
  `-I${join(source, "VM/src")}`, join(root, "bridge.cpp"), ...sources,
  "-sMODULARIZE=1", "-sEXPORT_ES6=1", "-sENVIRONMENT=web,worker,node", "-sEXPORT_NAME=createLuauAnalysis",
  "-sALLOW_MEMORY_GROWTH=1", "-sMAXIMUM_MEMORY=268435456", "-sINITIAL_MEMORY=16777216", "-sSTACK_SIZE=2097152",
  "-sDISABLE_EXCEPTION_CATCHING=0", "-sABORTING_MALLOC=0", "-sERROR_ON_UNDEFINED_SYMBOLS=1",
  '-sEXPORTED_RUNTIME_METHODS=["ccall"]', "-o", join(output, "backend.js")];
// Response files avoid Windows argv length limits. Contents are compiler arguments, never shell commands.
const response = join(mkdtempSync(join(tmpdir(), "luau-analysis-build-")), "compile.rsp");
writeFileSync(response, args.map(a => JSON.stringify(a.replaceAll("\\", "/"))).join("\n"));
const start = performance.now();
run(python, [compiler, `@${response}`], { env });
copyFileSync(join(source, "LICENSE.txt"), join(output, "LICENSE.txt"));
const hash = p => createHash("sha256").update(readFileSync(p)).digest("hex");
const manifest = { abi: 1, source: PIN, compiler: "Emscripten 4.0.10", compilerVersion: version,
  bridgeSha256: hash(join(root, "bridge.cpp")), sourceManifestSha256: hash(join(source, "Sources.cmake")),
  compilerScriptSha256: hash(compiler), flags: args.filter(a => a.startsWith("-") && !a.startsWith("-I") && a !== "-o"),
  includeTargets: targets, buildMs: performance.now() - start, memoryMaximumBytes: 268435456,
  artifacts: Object.fromEntries(["backend.js", "backend.wasm", "LICENSE.txt"].map(p => [p, { sha256: hash(join(output, p)), bytes: readFileSync(join(output, p)).length }])) };
writeFileSync(join(output, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify(manifest, null, 2));
