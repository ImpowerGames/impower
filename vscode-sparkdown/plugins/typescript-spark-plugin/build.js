const chokidar = require("chokidar");
const fs = require("fs");
const path = require("path");
const process = require("process");
const { exec } = require("child_process");

const ENTRY_FILE_PATH = "index.ts";

const DECLARATIONS_FILE_PATH =
  "../../../packages/spark-web-player/types/spark.d.ts";

const WATCH = process.argv.includes("--watch");

const LOG_PREFIX =
  (WATCH ? "[watch] " : "") + `${path.basename(process.cwd())}: `;

const rootDir = process.cwd();
const packageJsonPath = path.join(rootDir, "package.json");
const declarationsFile = path.resolve(rootDir, DECLARATIONS_FILE_PATH);

function build() {
  console.log(LOG_PREFIX + `build started`);

  exec("tsc", async (err, stdout, stderr) => {
    if (stdout) console.log(stdout.trim());
    if (stderr) console.error(stderr.trim());
    if (err) console.error(LOG_PREFIX + "Failed:", err.message);

    inject();

    console.log(LOG_PREFIX + `build finished`);
  });
}

function inject() {
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
    const mainFile = packageJson.main;

    if (!mainFile) {
      throw new Error(`"main" field not found in package.json`);
    }

    const templateFile = path.join(rootDir, mainFile);
    const outputFile = templateFile;

    const templateContent = fs.readFileSync(templateFile, "utf-8");
    const declarationsContent = fs.readFileSync(declarationsFile, "utf-8");

    const result = templateContent.replace(/"{{DECLARATIONS}}"/g, () =>
      JSON.stringify(declarationsContent)
    );
    fs.writeFileSync(outputFile, result, "utf-8");
    console.log(LOG_PREFIX + "injected declarations");
  } catch (error) {
    console.error(
      LOG_PREFIX + "Error:",
      error instanceof Error ? error.message : error
    );
  }
}

// Initial run
build();

if (WATCH) {
  const entryFile = path.join(rootDir, ENTRY_FILE_PATH);

  const watcher = chokidar.watch(entryFile, { ignoreInitial: true });

  watcher.on("change", () => {
    console.log(
      LOG_PREFIX + `change detected in ${ENTRY_FILE_PATH}, rebuilding...`
    );
    build();
  });
}
