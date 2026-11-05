import tsParser from "@typescript-eslint/parser";
import yml from "eslint-plugin-yml";
import sparkdownGrammar from "./packages/eslint-plugin-sparkdown-grammar/src/index.ts";

const SCRIPT_FILES = ["**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"];

const RADIX_SOURCE = "/^@radix-ui[^a-z0-9-]/";
const RADIX_MESSAGE =
  "Import @radix-ui/* only inside packages/impower-ui; use the @impower/impower-ui component that wraps the primitive instead.";

export default [
  {
    ignores: ["**/dist/**", "**/out/**", "**/.tmp/**", "**/coverage/**"],
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
          patterns: [{ group: ["@radix-ui/*"], message: RADIX_MESSAGE }],
        },
      ],
      "no-restricted-syntax": [
        "error",
        { selector: `ImportExpression[source.value=${RADIX_SOURCE}]`, message: RADIX_MESSAGE },
        { selector: `ImportExpression[source.quasis.0.value.raw=${RADIX_SOURCE}]`, message: RADIX_MESSAGE },
        {
          selector: `CallExpression[callee.name="require"][arguments.0.value=${RADIX_SOURCE}]`,
          message: RADIX_MESSAGE,
        },
        { selector: `TSImportType[argument.literal.value=${RADIX_SOURCE}]`, message: RADIX_MESSAGE },
      ],
    },
  },
];
