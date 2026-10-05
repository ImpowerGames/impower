// Private bounded integration build; does not modify the pinned source or SDK.
// Default is a plan only. --build requires the parent's coordinated window.
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join, dirname, resolve, relative, sep, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = dirname(fileURLToPath(import.meta.url));
const prototype = join(root, "native-prototype");
const old = JSON.parse(readFileSync(join(prototype, "inputs.json"), "utf8"));
const cached = JSON.parse(readFileSync(join(prototype, "cached-result.json"), "utf8"));
const worktree = "C:/Users/Lovelle/Documents/GitHub/impower.worktrees/codex/refactor/1387-incremental-checker";
const native = join(worktree, "packages/sparkdown/native/luau-analysis");
const productionOutput = join(worktree, "packages/sparkdown/vendor/luau-analysis");
const privateOutputIndex = process.argv.indexOf("--private-output");
const output = privateOutputIndex < 0 ? productionOutput : resolve(process.argv[privateOutputIndex + 1] ?? "");
const relinkOnly = process.argv.includes("--relink-only") || process.argv.includes("--plan-relink");
const execute = process.argv.includes("--build") || process.argv.includes("--relink-only");
if (privateOutputIndex >= 0) {
  const destination = relative(root, output);
  if (!process.argv[privateOutputIndex + 1] || isAbsolute(destination) || destination === "" || destination === ".."
    || destination.startsWith(".." + sep) || resolve(output) === resolve(productionOutput))
    throw Error("Private comparison output must be a named descendant of this checkpoint directory");
}
if (relinkOnly && privateOutputIndex < 0) throw Error("Relink-only requires a private comparison output");
const planPath = join(root, privateOutputIndex < 0 ? "production-build-plan.json" : "reproducible-relink-plan.json");
const source = resolve("C:/Users/Lovelle/AppData/Local/Temp/luau-typecheck-1368");
const sdk = old.sdk;
const compiler = join(sdk, "upstream/emscripten/em++.py");
const python = join(sdk, "python/3.13.3_64bit/python.exe");
const env = { ...process.env, EM_CONFIG: join(sdk, ".emscripten") };
const hash = value => createHash("sha256").update(value).digest("hex");
const fileHash = path => hash(readFileSync(path));
function run(command, args) {
  const r = spawnSync(command, args, { env, encoding: "utf8", windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
  if (r.status !== 0) throw Error(JSON.stringify({ command, args, exit: r.status, error: r.error, stdout: r.stdout, stderr: r.stderr }));
  return r.stdout.trim();
}
if (cached.exit !== 0 || old.source !== "7d5f73364fdbbaa984fa545071630eba73cfea98") throw Error("Invalid existing cache receipt");
if (run("git", ["-C", source, "rev-parse", "HEAD"]) !== old.source) throw Error("Wrong upstream pin");
if (run("git", ["-C", source, "status", "--porcelain", "--untracked-files=no"])) throw Error("Dirty upstream source");
// A plan-only audit must not start the compiler. Its version comes from the
// actual successful artifact receipt and is tied to the verified script hash.
const previousManifest = JSON.parse(readFileSync(join(productionOutput, "manifest.json"), "utf8"));
if (fileHash(compiler) !== previousManifest.compilerScriptSha256) throw Error("Compiler script differs from production provenance");
const version = previousManifest.compilerVersion;
if (!version?.includes("4.0.10")) throw Error("Missing successful compiler-version provenance");
if (execute && run(python, [compiler, "--version"]) !== version) throw Error("Compiler version changed");
const targets = ["Common", "Ast", "Bytecode", "Compiler", "Config", "VM", "Analysis"];
const baseCompileFlags = ["-std=c++17", "-O2", "-fexceptions", "-DNDEBUG",
  ...targets.map(target => "-I" + join(source, target, "include")), "-I" + join(source, "VM/src")];
if (JSON.stringify(baseCompileFlags) !== JSON.stringify(cached.compileFlags)) throw Error("Cache compiler flags differ");
const { materializeScopeOverlay } = await import(pathToFileURL(join(native, "scope-overlay.mjs")));
const overlayRoot = join(root, "scope-overlay");
const scopeOverlay = materializeScopeOverlay(source, overlayRoot);
const compileFlags = [...baseCompileFlags.slice(0, 4), "-I" + join(overlayRoot, "Analysis/include"),
  "-ffile-prefix-map=" + overlayRoot + "=luau", ...baseCompileFlags.slice(4)].map(flag => flag.replaceAll("\\", "/"));
const headerAudit = JSON.parse(readFileSync(join(root, "scope-header-dependencies.json"), "utf8"));
if (headerAudit.pin !== old.source || headerAudit.status !== "bounded-closure-complete" || !headerAudit.sourceHashesMatchCache)
  throw Error("Unverified header dependency closure");
for (const [path, expected] of Object.entries(headerAudit.inputs))
  if (fileHash(path) !== expected) throw Error("Header audit input changed: " + path);
const affected = new Set(headerAudit.affected.map(entry => resolve(entry.source)));
const baselineObjects = JSON.parse(readFileSync(join(root, "pre-scope-hook-build-result.json"), "utf8"));
if (baselineObjects.exit !== 0 || baselineObjects.plan.pin !== old.source) throw Error("Missing successful pre-hook object receipt");
if (fileHash(compiler) !== previousManifest.compilerScriptSha256) throw Error("Compiler script differs from production provenance");
const priorSources = old.args.filter(arg => arg.endsWith(".cpp"));
const sourcesCmake = readFileSync(join(source, "Sources.cmake"), "utf8");
const sources = [];
for (const target of targets) {
  const block = sourcesCmake.match(new RegExp("target_sources\\(Luau\\." + target + " PRIVATE([\\s\\S]*?)\\n\\)"));
  if (!block) throw Error("Missing target " + target);
  sources.push(...block[1].trim().split(/\s+/).filter(p => p.endsWith(".cpp")).map(p => join(source, p)));
}
const allCached = sources.map(path => {
  const index = priorSources.findIndex(prior => resolve(prior) === resolve(path));
  const prior = priorSources[index], object = cached.objects[index];
  if (index < 0 || fileHash(path) !== cached.inputs[prior] || !existsSync(object) || readFileSync(object).length === 0)
    throw Error("Invalid cached TU: " + path);
  const attested = baselineObjects.plan.reused.find(entry => resolve(entry.object) === resolve(object));
  if (!attested || fileHash(object) !== attested.objectSha256) throw Error("Cached object changed since successful build: " + path);
  return { source: path, sourceSha256: fileHash(path), object, objectSha256: fileHash(object) };
});
if (allCached.length !== headerAudit.auditedTUs) throw Error("Header audit TU inventory differs");
// The extra include directory contains only the two patched headers. Neither
// it nor its filename-prefix map can affect a validated closure that reaches
// neither header nor any patched cpp file. Every other TU is recompiled.
const reused = allCached.filter(entry => !affected.has(resolve(entry.source)));
const upstreamChanged = sources.filter(path => affected.has(resolve(path))).map(path => {
  const file = scopeOverlay.files.find(file => resolve(source, file.path) === resolve(path));
  return file ? join(overlayRoot, file.path) : path;
});
const changed = [join(native, "bridge.cpp"), join(native, "ast-input.cpp"), join(native, "incremental-scopes.cpp"), ...upstreamChanged];
const cache = join(root, "production-objects");
const headerFiles = [join(native, "ast-input.h"), join(native, "incremental-scopes.h"), join(native, "scope-overlay.mjs"),
  join(native, "source-metadata.h"),
  ...scopeOverlay.files.filter(file => file.path.endsWith(".h")).map(file => join(overlayRoot, file.path))];
// Source/overlay headers have a per-TU include closure. An unrelated private
// header must not invalidate the eight unchanged official overlay consumers.
// Pin/header-audit/toolchain validation above remains mandatory for every TU.
const includeDirectories = [join(overlayRoot, "Analysis/include"), ...targets.map(target => join(source, target, "include")), join(source, "VM/src")];
const watchedHeaders = new Set(headerFiles.filter(path => path.endsWith(".h")).map(path => resolve(path)));
function relevantDependencies(path) {
  const visited = new Set(), relevant = new Set();
  function visit(file) {
    file = resolve(file); if (visited.has(file)) return; visited.add(file);
    const content = readFileSync(file, "utf8");
    for (const include of content.matchAll(/^\s*#\s*include\s*(["<])([^">]+)[">]/gm)) {
      const candidates = [...(include[1] === '"' ? [join(dirname(file), include[2])] : []), ...includeDirectories.map(dir => join(dir, include[2]))];
      const dependency = candidates.find(existsSync);
      if (!dependency) continue; // Standard library/SDK: attested compiler and flags.
      const resolved = resolve(dependency); if (watchedHeaders.has(resolved)) relevant.add(resolved);
      visit(resolved);
    }
  }
  visit(path); return [...relevant].sort();
}
const dependencies = new Map(changed.map(path => [path, relevantDependencies(path)]));
const objectIdentity = path => hash(JSON.stringify({ source: fileHash(path),
  headers: dependencies.get(path).map(header => [header, fileHash(header)]), compileFlags, compiler: fileHash(compiler) }));
const objects = changed.map(path => join(cache, hash(path).slice(0, 12) + "-" + objectIdentity(path).slice(0, 12) + ".o"));
const priorResult = join(root, "production-build-result.json");
const priorBuild = existsSync(priorResult) ? JSON.parse(readFileSync(priorResult, "utf8")) : undefined;
const compatibleOwnedCache = priorBuild?.exit === 0
  && priorBuild.plan.pin === old.source
  && priorBuild.plan.compilerScriptSha256 === fileHash(compiler)
  && JSON.stringify(priorBuild.plan.compileFlags) === JSON.stringify(compileFlags);
const ownedReused = changed.flatMap((path, i) => {
  if (!compatibleOwnedCache || priorBuild.plan.inputs[path] !== fileHash(path)
    || !dependencies.get(path).every(header => priorBuild.plan.inputs[header] === fileHash(header))) return [];
  const receipt = priorBuild.logs.find(log => log.step === "compile" && log.path === path)
    ?? priorBuild.plan.ownedReused?.find(entry => entry.source === path);
  if (!receipt || !existsSync(receipt.object) || fileHash(receipt.object) !== receipt.objectSha256) return [];
  objects[i] = receipt.object;
  return [{ source: path, sourceSha256: fileHash(path), object: receipt.object, objectSha256: receipt.objectSha256,
    provenance: priorBuild.startedAt, dependencies: Object.fromEntries(dependencies.get(path).map(header => [header, fileHash(header)])) }];
});
const compileSources = changed.filter(p => !ownedReused.some(r => r.source === p));
if (relinkOnly && compileSources.length) throw Error("Relink-only refuses every uncached translation unit");
// Compilation scheduling and cache groups must never reorder linker inputs.
// Match build.mjs: the three owned TUs, then every Sources.cmake TU in order.
const objectBySource = new Map(changed.map((path, i) => [resolve(path), objects[i]]));
for (const entry of reused) {
  if (objectBySource.has(resolve(entry.source))) throw Error("Duplicate source in link inventory");
  objectBySource.set(resolve(entry.source), entry.object);
}
const orderedSources = [...changed.slice(0, 3), ...sources.map(path => {
  const file = scopeOverlay.files.find(file => resolve(source, file.path) === resolve(path));
  return file ? join(overlayRoot, file.path) : path;
})];
const orderedLink = orderedSources.map(path => {
  const object = objectBySource.get(resolve(path));
  if (!object) throw Error("Missing canonical link object: " + path);
  const cached = !compileSources.includes(path);
  if (cached && (!existsSync(object) || readFileSync(object).length === 0)) throw Error("Missing attested link object: " + path);
  return { source: path, sourceSha256: fileHash(path), object, objectSha256: cached ? fileHash(object) : null };
});
if (orderedLink.length !== 144 || new Set(orderedSources.map(path => resolve(path))).size !== 144
  || new Set(orderedLink.map(entry => resolve(entry.object))).size !== 144 || objectBySource.size !== 144)
  throw Error("Canonical linker inventory must have exactly 144 unique sources and objects");
const linkFlags = ["-sMODULARIZE=1", "-sEXPORT_ES6=1", "-sENVIRONMENT=web,worker,node", "-sEXPORT_NAME=createLuauAnalysis",
  "-sALLOW_MEMORY_GROWTH=1", "-sMAXIMUM_MEMORY=268435456", "-sINITIAL_MEMORY=16777216", "-sSTACK_SIZE=2097152",
  "-sDISABLE_EXCEPTION_CATCHING=0", "-sABORTING_MALLOC=0", "-sERROR_ON_UNDEFINED_SYMBOLS=1",
  '-sEXPORTED_RUNTIME_METHODS=["ccall","writeArrayToMemory"]'];
const inputFiles = [...changed, ...headerFiles, ...scopeOverlay.files.map(file => join(overlayRoot, file.path)),
  join(native, "scope-overlay.d.mts"), join(native, "build.mjs"),
  ...["Ast.ts", "readLuauAst.ts", "LuauDocumentChecker.ts", "SparkdownAnalysisAst.ts", "SparkdownAnalysisCodec.ts", "SparkdownAnalysisInputs.ts", "SparkdownAnalysis.ts"].map(p => join(worktree, "packages/sparkdown/src/compiler/typecheck", p)),
  ...["contract.ts", "wasm-adapter.ts", "runtime.mjs"].map(p => join(worktree, "packages/sparkdown/src/analysis-backend", p)),
  ...["analysis-backend/module-resolution.test.ts", "analysis-backend/incremental-scope-graphs.test.ts",
    "analysis-backend/typefunction-lexical-scopes.test.ts", "analysis-backend/scope-overlay.test.ts",
    "analysis-backend/source-metadata.test.ts", "analysis-backend/source-metadata-reuse.test.ts", "analysis-backend/scope-source-metadata.test.ts", "analysis-backend/scope-alias-precedence.test.ts", "analysis-backend/source-metadata-graph-shift.test.ts", "analysis-backend/scope-source-view.test.ts",
    "analysis-backend/source-metadata-remaining-graphs.test.ts", "analysis-backend/typefunction-correspondence.test.ts", "analysis-backend/typefunction-environment-invalidation.test.ts",
    "analysis-backend/source-metadata-acceptance-gaps.test.ts", "analysis-backend/typefunction-shifted-error-location.test.ts", "analysis-backend/source-metadata-indexer-origin.test.ts",
    "compiler/SparkdownAnalysisSourceShift.test.ts", "compiler/SparkdownAnalysisSourceMetadata.test.ts",
    "compiler/SparkdownAnalysis.test.ts", "compiler/SparkdownAnalysisLifecycle.test.ts"].map(p => join(worktree, "packages/sparkdown/src/tests", p))];
const plan = { pin: old.source, compiler, compilerVersion: version, compilerScriptSha256: fileHash(compiler),
  plannerSha256: fileHash(fileURLToPath(import.meta.url)), compilerVersionEvidence: "successful prior artifact manifest; no plan-only compiler execution",
  workers: 1, totalTUs: reused.length + changed.length, cachedTUs: reused.length + ownedReused.length, uncachedTUs: compileSources.length,
  syntaxFirst: compileSources, compileFlags, baseCompileFlags, scopeOverlay, headerAuditSha256: fileHash(join(root, "scope-header-dependencies.json")),
  headerDependencies: Object.fromEntries([...dependencies].map(([path, headers]) => [path, Object.fromEntries(headers.map(header => [header, fileHash(header)]))])),
  linkFlags, output, orderedLink, relinkOnly, inputs: Object.fromEntries(inputFiles.map(p => [p, fileHash(p)])), reused, ownedReused };
if (execute) {
  const frozen = JSON.parse(readFileSync(planPath, "utf8"));
  if (JSON.stringify(plan.inputs) !== JSON.stringify(frozen.inputs) || JSON.stringify(plan.compileFlags) !== JSON.stringify(frozen.compileFlags))
    throw Error("Frozen production inputs changed");
  if (plan.plannerSha256 !== frozen.plannerSha256 || JSON.stringify(plan.headerDependencies) !== JSON.stringify(frozen.headerDependencies))
    throw Error("Frozen planner or header closure changed");
  if (JSON.stringify(plan.ownedReused) !== JSON.stringify(frozen.ownedReused)) throw Error("Frozen owned object cache changed");
  if (plan.output !== frozen.output || plan.relinkOnly !== frozen.relinkOnly
    || JSON.stringify(plan.orderedLink) !== JSON.stringify(frozen.orderedLink)) throw Error("Frozen canonical link inventory changed");
}
writeFileSync(planPath, JSON.stringify(plan, null, 2) + "\n");
console.log(JSON.stringify({ workers: 1, totalTUs: plan.totalTUs, cachedTUs: plan.cachedTUs, uncachedTUs: plan.uncachedTUs, inputs: plan.inputs }));
if (execute) {
  mkdirSync(output, { recursive: true });
  mkdirSync(cache, { recursive: true });
  const start = performance.now(), logs = [];
  const startedAt = new Date().toISOString();
  console.log(JSON.stringify({ status: "building", startedAt, workers: 1 }));
  try {
    for (const path of compileSources) { run(python, [compiler, ...compileFlags, "-fsyntax-only", path.replaceAll("\\", "/")]); logs.push({ step: "syntax", path, exit: 0 }); }
    for (const path of compileSources) {
      const object = objects[changed.indexOf(path)];
      run(python, [compiler, ...compileFlags, "-c", path.replaceAll("\\", "/"), "-o", object.replaceAll("\\", "/")]); logs.push({ step: "compile", path, object, objectSha256: fileHash(object), exit: 0 });
    }
    const response = join(root, privateOutputIndex < 0 ? "production-link.rsp" : "reproducible-relink.rsp");
    writeFileSync(response, [...compileFlags, ...orderedLink.map(entry => entry.object), ...linkFlags, "-o", join(output, "backend.js")]
      .map(arg => JSON.stringify(arg.replaceAll("\\", "/"))).join("\n"));
    run(python, [compiler, "@" + response]); logs.push({ step: "link", exit: 0 });
    copyFileSync(join(source, "LICENSE.txt"), join(output, "LICENSE.txt"));
    for (const name of ["backend.js", "LICENSE.txt"]) writeFileSync(join(output, name), readFileSync(join(output, name), "utf8").replaceAll("\r\n", "\n"));
    const manifest = { abi: 1, source: old.source, compiler: "Emscripten 4.0.10", compilerVersion: version,
      bridgeSha256: fileHash(changed[0]), astInputSha256: fileHash(changed[1]), astInputHeaderSha256: fileHash(join(native, "ast-input.h")),
      incrementalScopesSha256: fileHash(changed[2]), incrementalScopesHeaderSha256: fileHash(join(native, "incremental-scopes.h")),
      sourceMetadataHeaderSha256: fileHash(join(native, "source-metadata.h")),
      scopeOverlaySha256: fileHash(join(native, "scope-overlay.mjs")), scopeOverlay,
      sourceManifestSha256: fileHash(join(source, "Sources.cmake")), compilerScriptSha256: fileHash(compiler),
      flags: [...compileFlags.filter(f => !f.startsWith("-I")), ...linkFlags], includeTargets: targets,
      buildMs: performance.now() - start, memoryMaximumBytes: 268435456, textNormalization: "LF",
      artifacts: Object.fromEntries(["backend.js", "backend.wasm", "LICENSE.txt"].map(name => [name, { sha256: fileHash(join(output, name)), bytes: readFileSync(join(output, name)).length }])) };
    writeFileSync(join(output, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
    writeFileSync(privateOutputIndex < 0 ? join(root, "production-build-result.json") : join(output, "build-result.json"), JSON.stringify({ exit: 0, startedAt, endedAt: new Date().toISOString(), plan, logs, manifest }, null, 2) + "\n");
    console.log(JSON.stringify({ exit: 0, startedAt, endedAt: new Date().toISOString(), buildMs: manifest.buildMs, artifacts: manifest.artifacts }));
  } catch (error) {
    writeFileSync(privateOutputIndex < 0 ? join(root, "production-build-result.json") : join(output, "build-result.json"), JSON.stringify({ exit: 1, startedAt, endedAt: new Date().toISOString(), plan, logs, failure: String(error) }, null, 2) + "\n");
    throw error;
  }
}
