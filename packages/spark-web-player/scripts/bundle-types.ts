import { exec } from "child_process";
import * as chokidar from "chokidar";
import fs from "fs";
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

const outputPath = path.resolve(getArgValue("--output", "types/spark.d.ts")!);
const projectPath = path.resolve(
  getArgValue("--project", "tsconfig.globals.json")!
);
const externalInlines = getArgArrayValue(
  "--external-inlines",
  "pixi.js @pixi/colord eventemitter3"
);

const project = new Project({
  tsConfigFilePath: projectPath,
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

// Get input paths from the tsconfig includes
function getInputPathsFromTsConfig(): string[] {
  return project.getSourceFiles().map((file) => file.getFilePath());
}

const inputPaths = getInputPathsFromTsConfig();
if (inputPaths.length === 0) {
  console.error(LOG_PREFIX + "No input files found from tsconfig includes.");
  process.exit(1);
}

function getIncludePathsFromTsConfig(tsconfigPath: string): string[] {
  const configJson = JSON.parse(fs.readFileSync(tsconfigPath, "utf-8"));
  const includes = configJson.include ?? [];
  return includes.map((p: string) => path.resolve(p));
}

function bundleTypes() {
  const includePaths = getIncludePathsFromTsConfig(projectPath);
  if (includePaths.length === 0) {
    console.error(LOG_PREFIX + "No include paths found in tsconfig.");
    process.exit(1);
  }
  const cmd = [
    "dts-bundle-generator",
    `-o "${outputPath}"`,
    ...includePaths.map((p) => `"${p}"`),
    `--project "${projectPath}"`,
    `--external-inlines=${externalInlines.join(" ")}`,
    "--export-referenced-types",
    "--no-banner=false",
    "--no-check",
    "--silent",
  ].join(" ");

  console.log(LOG_PREFIX + "build started");
  exec(cmd, async (err, stdout, stderr) => {
    if (stdout) console.log(stdout.trim());
    if (stderr) console.error(stderr.trim());
    if (err) console.error(LOG_PREFIX + "Failed:", err.message);
    removeShadowingInterfaces(outputPath);
    console.log(LOG_PREFIX + "build finished");
  });
}

function removeShadowingInterfaces(outputFilePath: string) {
  let content = fs.readFileSync(outputFilePath, "utf8");

  const classNames = new Set<string>();
  const classRegex = /(?:declare\s+)?class\s+(\w+)/g;
  let match;

  // First, find all declared classes
  while ((match = classRegex.exec(content)) !== null) {
    classNames.add(match[1]!);
  }

  // Remove interfaces that shadow those classes
  for (const className of classNames) {
    const interfaceRegex = new RegExp(
      `export\\s+interface\\s+${className}[^{]*[{][^{}]*[}]`,
      "g"
    );
    content = content.replace(interfaceRegex, () => {
      console.log(LOG_PREFIX + `removed shadowing interface: ${className}`);
      return ""; // remove the matched interface
    });
  }

  fs.writeFileSync(outputFilePath, content);
}

async function watchDependencies() {
  for (const inputPath of inputPaths) {
    const sourceFile =
      project.getSourceFile(inputPath) ||
      project.addSourceFileAtPath(inputPath);
    const deps = Array.from(getAllDependencies(sourceFile));
    deps.forEach((dep) => {
      if (dep.replaceAll("\\", "/") !== outputPath.replaceAll("\\", "/")) {
        watchedFiles.add(dep);
      }
    });
  }

  watcher = chokidar.watch(Array.from(watchedFiles), { ignoreInitial: true });

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
