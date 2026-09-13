// Executed only by test-suite under its machine-wide reservation and heap cap.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const [mode, packageRoot, output, file] = process.argv.slice(2);
const require = createRequire(path.join(packageRoot, "package.json"));
const { createVitest, startVitest } = await import(pathToFileURL(require.resolve("vitest/node")));
const options = { root: packageRoot, watch: false, pool: "forks", fileParallelism: false,
  maxWorkers: 1, minWorkers: 1,
  poolOptions: { forks: { minForks: 1, maxForks: 1, execArgv: ["--max-old-space-size=1024"] } },
};
const viteOptions = { cacheDir: path.join(path.dirname(output), "vite-cache") };
let ctx;
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
    // An exact literal glob must not rely on an unrelated hoisted dependency.
    const literal = path.relative(packageRoot, file).replaceAll("\\", "/").replace(/([*?\[\]{}()!+@])/g, "\\$1");
    ctx = await startVitest("test", [], { ...options,
      include: [literal],
      reporters: ["default", "json"], outputFile: { json: output },
    }, viteOptions);
    if (!ctx) throw new Error("Vitest did not start");
    if (ctx.state.getUnhandledErrors().length) process.exitCode = 1;
  } else throw new Error("Unknown engine mode");
} finally { await ctx?.close(); }
