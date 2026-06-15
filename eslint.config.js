// ESLint flat config for the impower repo. Currently scoped to YAML
// files under `definitions/yaml/` so the in-house
// `@impower/eslint-plugin-sparkdown-grammar` rules give live feedback
// while editing `sparkdown.language-grammar.yaml`.
//
// The plugin is loaded by relative path because the packages in this
// repo aren't formal npm workspaces. Node 23 strip-types lets the
// plugin's `.ts` entry import without a build step. See
// `packages/eslint-plugin-sparkdown-grammar/README.md`.

import yml from "eslint-plugin-yml";
import sparkdownGrammar from "./packages/eslint-plugin-sparkdown-grammar/src/index.ts";

export default [
  // `flat/base` wires `yaml-eslint-parser` for `.yaml`/`.yml` files
  // without enabling any of eslint-plugin-yml's opinionated style rules
  // (those clash with the grammar file's existing formatting).
  ...yml.configs["flat/base"],
  {
    files: ["definitions/yaml/sparkdown.language-grammar.yaml"],
    plugins: {
      "sparkdown-grammar": sparkdownGrammar,
    },
    rules: {
      "sparkdown-grammar/tag-name-symmetry": "error",
      "sparkdown-grammar/parse-tag-valid": "error",
      "sparkdown-grammar/no-raw-whitespace-class": "error",
      "sparkdown-grammar/no-handwritten-alternation": "warn",
      "sparkdown-grammar/capturing-var-naming": "error",
    },
  },
];
