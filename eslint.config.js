import tsParser from "@typescript-eslint/parser";
import yml from "eslint-plugin-yml";
import sparkdownGrammar from "./packages/eslint-plugin-sparkdown-grammar/src/index.ts";

const SCRIPT_FILES = ["**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"];

export default [
  {
    ignores: [
      "**/dist/**",
      "**/out/**",
      "**/build/**",
      "**/.tmp/**",
      "**/coverage/**",
    ],
  },
  ...yml.configs["flat/base"],
  {
    files: ["definitions/yaml/sparkdown.language-grammar.yaml"],
    plugins: {
      "sparkdown-grammar": sparkdownGrammar,
    },
    rules: { ...sparkdownGrammar.configs.recommended.rules },
  },
  {
    files: SCRIPT_FILES,
    languageOptions: { parser: tsParser },
  },
  {
    files: SCRIPT_FILES,
    ignores: ["packages/impower-ui/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@radix-ui/*"],
              message:
                "Import @radix-ui/* only inside packages/impower-ui; use the @impower/impower-ui component that wraps the primitive instead.",
            },
          ],
        },
      ],
    },
  },
];
