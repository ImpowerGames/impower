// Derives the production runtime dependency closure for the Docker runtime
// image by scanning the built API bundle (out/api/index.js) for the bare module
// specifiers it leaves external, then emitting a minimal package.json with those
// deps pinned to the ranges declared in impower-dev/package.json.
//
// build.ts bundles the entire server into out/api/index.js and externalizes only
// a handful of packages (fastify + several @fastify/* plugins, registered via
// `import(`@fastify/...`)`, plus the auto-externalized dotenv / googleapis). This
// script reads that set from the artifact itself so the runtime image never
// drifts from what the bundle actually requires.
//
// Usage: node scripts/collect-runtime-deps.mjs <bundle> <pkgJson> <outPkgJson>

import fs from "fs";
import { builtinModules } from "module";

const [, , bundlePath, pkgJsonPath, outPath] = process.argv;
if (!bundlePath || !pkgJsonPath || !outPath) {
  console.error(
    "usage: node collect-runtime-deps.mjs <bundle> <pkgJson> <outPkgJson>",
  );
  process.exit(1);
}

const src = fs.readFileSync(bundlePath, "utf8");
const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
const builtins = new Set(builtinModules);

// Match `from "x"`, `import("x")`, `require("x")` with any quote style
// (single, double, or backtick — the bundle uses backticks for dynamic imports).
const re = /(?:from|import|require)\s*\(?\s*[`'"]([^`'"]+)[`'"]/g;

const names = new Set();
for (const m of src.matchAll(re)) {
  const spec = m[1];
  if (spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("node:")) {
    continue;
  }
  const parts = spec.split("/");
  const name = spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
  if (builtins.has(name)) {
    continue;
  }
  names.add(name);
}

const declared = { ...pkg.dependencies, ...pkg.peerDependencies };
const deps = {};
const missing = [];
for (const name of [...names].sort()) {
  if (declared[name]) {
    deps[name] = declared[name];
  } else {
    missing.push(name);
  }
}

if (missing.length) {
  console.error(
    `The API bundle imports packages not declared in impower-dev dependencies: ${missing.join(", ")}`,
  );
  process.exit(1);
}

fs.writeFileSync(
  outPath,
  JSON.stringify(
    {
      name: "impower-dev-runtime",
      version: pkg.version,
      private: true,
      type: "module",
      dependencies: deps,
    },
    null,
    2,
  ),
);

console.log(`runtime deps: ${Object.keys(deps).join(", ")}`);
