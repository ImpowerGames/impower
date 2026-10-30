import yml from "eslint-plugin-yml";
import sparkdownGrammar from "./packages/eslint-plugin-sparkdown-grammar/src/index.ts";

export default [
  ...yml.configs["flat/base"],
  {
    files: ["definitions/yaml/sparkdown.language-grammar.yaml"],
    plugins: {
      "sparkdown-grammar": sparkdownGrammar,
    },
    rules: { ...sparkdownGrammar.configs.recommended.rules },
  },
];
