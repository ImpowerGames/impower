import { exec } from "child_process";
import * as chokidar from "chokidar";
import path from "path";
import { Project, SourceFile } from "ts-morph";

const WATCH = process.argv.includes("--watch");

const LOG_PREFIX =
  (WATCH ? "[watch] " : "") + `${path.basename(process.cwd())}: `;

const getArgValue = (key: string, fallback?: string): string | undefined => {
  const index = process.argv.findIndex((arg) => arg === key);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const getArgArrayValue = (key: string, fallback?: string): string[] => {
  return getArgValue(key, fallback)!
    .split(" ")
    .map((x) => x.trim())
    .filter(Boolean);
};

const inputPath = path.resolve(getArgValue("--input", "src/app/World.ts")!);
const outputPath = path.resolve(getArgValue("--output", "types/spark.d.ts")!);
const projectPath = path.resolve(
  getArgValue("--project", "tsconfig.types.json")!
);
const externalInlines = getArgArrayValue(
  "--external-inlines",
  "pixi.js @pixi/colord eventemitter3"
);

const project = new Project({
  tsConfigFilePath: "tsconfig.json",
});
const watchedFiles = new Set<string>();
let watcher: chokidar.FSWatcher;

function getAllDependencies(
  file: SourceFile,
  seen = new Set<string>()
): Set<string> {
  const filePath = file.getFilePath();
  if (seen.has(filePath)) return seen;
  seen.add(filePath);

  file.getImportDeclarations().forEach((imp) => {
    const moduleSource = imp.getModuleSpecifierSourceFile();
    if (moduleSource) {
      getAllDependencies(moduleSource, seen);
    }
  });

  return seen;
}

function bundleTypes() {
  const cmd = [
    "dts-bundle-generator",
    `-o "${outputPath}"`,
    `"${inputPath}"`,
    `--project "${projectPath}"`,
    `--external-inlines=${externalInlines.join(" ")}`,
    "--no-check",
    "--silent",
  ].join(" ");

  console.log(LOG_PREFIX + "build started");
  exec(cmd, (err, stdout, stderr) => {
    if (stdout) console.log(stdout.trim());
    if (stderr) console.error(stderr.trim());
    if (err) console.error(LOG_PREFIX + "Failed:", err.message);
  });
  console.log(LOG_PREFIX + "build finished");
}

async function watchDependencies() {
  const sourceFile =
    project.getSourceFile(inputPath) || project.addSourceFileAtPath(inputPath);
  const deps = Array.from(getAllDependencies(sourceFile));

  deps.forEach((dep) => watchedFiles.add(dep));

  watcher = chokidar.watch(deps, { ignoreInitial: true });

  watcher.on("change", (filePath) => {
    console.log(LOG_PREFIX + `File changed: ${filePath}`);
    watcher.close().then(() => {
      watchedFiles.clear();
      watchDependencies();
      bundleTypes();
    });
  });
}

// --- Start ---
bundleTypes();

if (WATCH) {
  watchDependencies().catch((err) => {
    console.error(LOG_PREFIX + "Error:", err);
    process.exit(1);
  });
}
