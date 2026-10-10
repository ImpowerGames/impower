// Executed only by test-suite under its machine-wide reservation and heap cap.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const [mode, packageRoot, output, file] = process.argv.slice(2);
const require = createRequire(path.join(packageRoot, "package.json"));
const { createVitest } = await import(pathToFileURL(require.resolve("vitest/node")));
const options = { root: packageRoot, watch: false, pool: "forks", fileParallelism: false,
  maxWorkers: 1, minWorkers: 1,
  poolOptions: { forks: { minForks: 1, maxForks: 1, execArgv: ["--max-old-space-size=1024"] } },
};
const viteOptions = { cacheDir: path.join(path.dirname(output), "vite-cache") };
let ctx;
const canonical = file => fs.realpathSync.native(file);
const specification = spec => ({ file: canonical(spec.moduleId), projectRoot: canonical(spec.project.config.root),
  projectName: spec.project.config.name || "", pool: spec.pool });
try {
  if (mode === "discover") {
    ctx = await createVitest("test", options, viteOptions);
    // Vitest 2 records automatically discovered workspace files on the context;
    // explicit workspace/projects configuration is also rejected, even with one project.
    if (ctx.config.workspace || ctx.config.projects || ctx._workspaceConfigPath || ctx.projects.length !== 1 || ctx.config.browser?.enabled || ctx.config.typecheck?.enabled || ctx.config.poolMatchGlobs?.length || path.resolve(ctx.config.root) !== packageRoot)
      throw new Error("Use a single Node test package with its own root (workspace/browser/typecheck/pool-routing configurations are unsupported)");
    const specs = await ctx.globTestFiles();
    fs.writeFileSync(output, JSON.stringify(specs.map(spec => spec.moduleId ?? spec[1])), "utf8");
  } else if (mode === "run") {
    ctx = await createVitest("test", { ...options,
      reporters: ["default", "json"], outputFile: { json: output },
    }, viteOptions);
    // Keep Vitest's configured projects, include/exclude, and changed/related
    // selection. CLI filename filters are substring matches, not identities.
    await ctx.init();
    const configured = await ctx.filterTestsBySource(await ctx.globTestSpecs());
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
      // Match Vitest 2.1.9 start(): stats precede runFiles and true enables its
      // complete-run coverage finalization. Every selected project spec stays.
      await ctx.cache.stats.populateStats(ctx.config.root, selected);
      await ctx.runFiles(selected, true);
    }
    if (ctx.state.getUnhandledErrors().length) process.exitCode = 1;
  } else throw new Error("Unknown engine mode");
} finally { await ctx?.close(); }
