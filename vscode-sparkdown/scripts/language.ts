import fs from "fs";
import YAML from "yaml";

const CONFIG_NAME = "sparkdown.language-config";
const IN_CONFIG_PATH = `./${CONFIG_NAME}.yaml`;
const OUT_CONFIG_PATHS = [
  `./language/${CONFIG_NAME}.json`,
  `../packages/sparkdown-editor/language/${CONFIG_NAME}.json`,
];

const GRAMMAR_NAME = "sparkdown.language-grammar";
const IN_GRAMMAR_PATH = `./${GRAMMAR_NAME}.yaml`;
const OUT_GRAMMAR_PATHS = [
  `./language/${GRAMMAR_NAME}.json`,
  `../packages/sparkdown-editor/language/${GRAMMAR_NAME}.json`,
];

const SNIPPETS_NAME = "sparkdown.language-snippets";
const IN_SNIPPETS_PATH = `./${SNIPPETS_NAME}.yaml`;
const OUT_SNIPPETS_PATHS = [
  `./language/${SNIPPETS_NAME}.json`,
  `../packages/sparkdown-editor/language/${SNIPPETS_NAME}.json`,
];

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
