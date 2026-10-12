// Executed only by test-suite under its machine-wide reservation and heap cap.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { validateAggregateInputs } from "./test-suite-aggregate.mjs";
import { atomic } from "./test-suite-process.mjs";

const [mode, packageRoot, output, file, requestHash] = process.argv.slice(2);
const require = createRequire(path.join(packageRoot, "package.json"));
const vitestVersion = require("vitest/package.json").version;
if (!["2.1.9", "3.2.6"].includes(vitestVersion)) throw new Error("Exact specification execution supports repository Vitest 2.1.9 or 3.2.6");
const { createVitest } = await import(pathToFileURL(require.resolve("vitest/node")));
const options = { root: packageRoot, watch: false, pool: "forks", fileParallelism: false,
  maxWorkers: 1, minWorkers: 1,
  poolOptions: { forks: { minForks: 1, maxForks: 1, execArgv: ["--max-old-space-size=1024"] } },
};
const viteOptions = { cacheDir: path.join(path.dirname(output), "vite-cache") };
let ctx;
let sequence = 0;
const taskStates = new Map();
const progress = event => {
  atomic(path.join(path.dirname(output), "progress.json"), { version: 1, mode, file: file ?? null,
    sequence: ++sequence, event, at: new Date().toISOString() });
};
const reporter = {
  onCollected(files) { if (files.length) progress("collected"); },
  onTaskUpdate(packs) {
    let changed = false;
    for (const [id, result] of packs) {
      if (!result) continue;
      const state = JSON.stringify([result.state, result.startTime, result.duration, result.errors?.length]);
      if (taskStates.get(id) !== state) { taskStates.set(id, state); changed = true; }
    }
    if (changed) progress("task-update");
  },
  onFinished() { progress("finished"); },
};
const canonical = file => fs.realpathSync.native(file);
const specification = spec => ({ file: canonical(spec.moduleId), projectRoot: canonical(spec.project.config.root),
  projectName: spec.project.config.name || "", pool: spec.pool });
const configuredSpecifications = context => vitestVersion === "3.2.6"
  ? context.getRelevantTestSpecifications()
  : context.globTestSpecs().then(specs => context.filterTestsBySource(specs));
const coverageSupported = context => {
  if (context.config.coverage.enabled && !["v8", "istanbul"].includes(context.config.coverage.provider))
    throw new Error("Exact per-file aggregation supports configured v8 or istanbul coverage only; custom providers are unsupported");
};
const directSupported = (context, { configuredBlob = true, reporterReferences } = {}) => {
  coverageSupported(context);
  if ([context.config, ...context.projects.map(project => project.config)].some(config =>
    Array.isArray(config.globalSetup) ? config.globalSetup.length : !!config.globalSetup))
    throw new Error("Exact per-file direct runs cannot preserve once-per-command globalSetup; use a package without configured globalSetup (setupFiles remain supported)");
  const references = reporterReferences === undefined ? context.reporters
    : Array.isArray(reporterReferences) ? reporterReferences : [reporterReferences];
  if (configuredBlob && references.some(value => value === "blob"
    || Array.isArray(value) && value[0] === "blob" || value?.constructor?.name === "BlobReporter"))
    throw new Error("Exact per-file direct aggregation cannot merge configured BlobReporter output; choose an ordinary reporter");
};
const admitCoverageAggregation = async context => {
  await context.initCoverageProvider();
  if (context.config.coverage.enabled && typeof context.coverageProvider?.mergeReports !== "function")
    throw new Error("Configured coverage provider cannot finalize combined reports");
};
try {
  if (mode === "discover") {
    // Pure inventory needs no configured reporter construction or lifecycle.
    ctx = await createVitest("test", { ...options, reporters: [{}] }, viteOptions);
    // Vitest 2 records automatically discovered workspace files on the context;
    // explicit workspace/projects configuration is also rejected, even with one project.
    if (ctx.config.workspace || ctx.config.projects || ctx._workspaceConfigPath || ctx.projects.length !== 1 || ctx.config.browser?.enabled || ctx.config.typecheck?.enabled || ctx.config.poolMatchGlobs?.length || path.resolve(ctx.config.root) !== packageRoot)
      throw new Error("Use a single Node test package with its own root (workspace/browser/typecheck/pool-routing configurations are unsupported)");
    const specs = await (vitestVersion === "3.2.6" ? ctx.globTestSpecifications() : ctx.globTestFiles());
    fs.writeFileSync(output, JSON.stringify(specs.map(spec => spec.moduleId ?? spec[1])), "utf8");
    progress("discovered");
  } else if (mode === "select") {
    // Inline reporters are supported by pinned Vitest. Override before creation
    // so configured custom modules/constructors and onInit/onClose cannot create
    // an unfinished second lifecycle. Finalization owns ordinary reporters.
    ctx = await createVitest("test", { ...options, reporters: [{}] }, viteOptions);
    // CLI reporter overrides do not erase the authored Vite test configuration.
    // Inspect its native name/tuple/instance forms without constructing it.
    directSupported(ctx, { reporterReferences: ctx.server.config.test?.reporters ?? [] });
    await admitCoverageAggregation(ctx);
    // This invocation-level initialization owns configured coverage.clean.
    // Later file attempts use private report directories and cannot leave an
    // older green report looking current when a clean=true command stops early.
    await ctx.init();
    const configured = await configuredSpecifications(ctx);
    fs.writeFileSync(output, JSON.stringify({ version: 1, specifications: configured.map(specification),
      coverage: { enabled: ctx.config.coverage.enabled, provider: ctx.config.coverage.provider,
        clean: ctx.config.coverage.clean, reportOnFailure: ctx.config.coverage.reportOnFailure } }), "utf8");
    progress("selected");
  } else if (mode === "run" || mode === "run-direct") {
    const direct = mode === "run-direct";
    ctx = await createVitest("test", { ...options,
      reporters: direct ? ["default", "json", "blob"] : ["default", "json"],
      outputFile: { json: output, ...(direct ? { blob: path.join(path.dirname(output), "blob.json") } : {}) },
    }, viteOptions);
    ctx.reporters.push(reporter);
    if (direct) {
      directSupported(ctx, { configuredBlob: false });
      // Defer only reporting/threshold publication; instrumentation and native
      // generated coverage maps remain configured. The final owned merge runs
      // the original reporters and thresholds once for the requested set.
      ctx.config.coverage.thresholds = undefined;
      ctx.config.coverage.reporter = [];
      ctx.config.coverage.reportsDirectory = path.join(path.dirname(output), "coverage");
      await admitCoverageAggregation(ctx);
    }
    // Keep Vitest's configured projects, include/exclude, and changed/related
    // selection. CLI filename filters are substring matches, not identities.
    await ctx.init();
    const configured = await configuredSpecifications(ctx);
    let requested;
    try { requested = canonical(file); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    const selected = requested ? configured.filter(spec => canonical(spec.moduleId) === requested) : [];
    fs.writeFileSync(path.join(path.dirname(output), "selection.json"), JSON.stringify({ version: 1,
      requested: file, canonical: requested ?? null, status: selected.length ? "selected" : "not-run",
      specifications: selected.map(specification) }), "utf8");
    if (!selected.length) {
      console.error("Requested file is absent from the configured Vitest selection: " + file);
      process.exitCode = 75;
    } else {
      // Match the pinned native start(): stats precede execution and true enables its
      // complete-run coverage finalization. Every selected project spec stays.
      await ctx.cache.stats.populateStats(ctx.config.root, selected);
      if (vitestVersion === "3.2.6") await ctx.runTestSpecifications(selected, true);
      else await ctx.runFiles(selected, true);
    }
    if (ctx.state.getUnhandledErrors().length) process.exitCode = 1;
  } else if (mode === "merge") {
    const { request, expected } = validateAggregateInputs(file, requestHash, packageRoot);
    ctx = await createVitest("test", { ...options, mergeReports: request.directory }, viteOptions);
    ctx.reporters.push(reporter);
    coverageSupported(ctx);
    if (request.failed && !ctx.config.coverage.reportOnFailure) ctx.config.coverage.enabled = false;
    await ctx.initCoverageProvider();
    if (ctx.config.coverage.enabled && typeof ctx.coverageProvider?.mergeReports !== "function")
      throw new Error("Configured coverage provider cannot finalize combined reports");
    // Native pinned merge validates versions, replays ordinary configured
    // reporters, combines generated maps and evaluates original thresholds.
    await ctx.mergeReports();
    fs.writeFileSync(output, JSON.stringify({ version: 1, status: process.exitCode ? "failed" : "passed",
      blobs: expected, coverageEnabled: ctx.config.coverage.enabled }), "utf8");
  } else throw new Error("Unknown engine mode");
} finally { await ctx?.close(); }
