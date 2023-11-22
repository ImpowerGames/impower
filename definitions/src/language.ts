import fs from "fs";
import path from "path";
import YAML from "yaml";

const RESET = "\x1b[0m";
const STRING = "%s";
const BLUE = "\x1b[34m" + STRING + RESET;
const MAGENTA = "\x1b[35m" + STRING + RESET;

const outPaths = process.argv.slice(2);

console.log(BLUE, "Propagating definitions to:");
console.log(
  MAGENTA,
  `  ${outPaths.map((p) => path.join(process.cwd(), p)).join("\n  ")}`
);

const CONFIG_NAME = "sparkdown.language-config";
const IN_CONFIG_PATH = `./yaml/${CONFIG_NAME}.yaml`;
const OUT_CONFIG_PATHS = outPaths.map(
  (outPath) => `${outPath}/${CONFIG_NAME}.json`
);

const GRAMMAR_NAME = "sparkdown.language-grammar";
const IN_GRAMMAR_PATH = `./yaml/${GRAMMAR_NAME}.yaml`;
const OUT_GRAMMAR_PATHS = outPaths.map(
  (outPath) => `${outPath}/${GRAMMAR_NAME}.json`
);

const SNIPPETS_NAME = "sparkdown.language-snippets";
const IN_SNIPPETS_PATH = `./yaml/${SNIPPETS_NAME}.yaml`;
const OUT_SNIPPETS_PATHS = outPaths.map(
  (outPath) => `${outPath}/${SNIPPETS_NAME}.json`
);

const buildJson = async (inYamlPath: string, outJsonPath: string) => {
  const text = await fs.promises.readFile(inYamlPath, "utf8");
  const parsed = YAML.parse(text);
  const json = JSON.stringify(parsed, null, 2);
  await fs.promises.writeFile(outJsonPath, json);
};

const build = async () => {
  await Promise.all(
    OUT_CONFIG_PATHS.map((outPath) => buildJson(IN_CONFIG_PATH, outPath))
  );
  await Promise.all(
    OUT_GRAMMAR_PATHS.map((outPath) => buildJson(IN_GRAMMAR_PATH, outPath))
  );
  await Promise.all(
    OUT_SNIPPETS_PATHS.map((outPath) => buildJson(IN_SNIPPETS_PATH, outPath))
  );
};

build().catch((err) => {
  console.error(err);
});
