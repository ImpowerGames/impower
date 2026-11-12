import { builtinModules } from "node:module";
import tsParser from "@typescript-eslint/parser";
import yml from "eslint-plugin-yml";
import sparkdownGrammar from "./packages/eslint-plugin-sparkdown-grammar/src/index.ts";

const SCRIPT_FILES = ["**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"];

const GRAMMAR_SOURCES = {
  story: "definitions/yaml/sparkdown.language-grammar.yaml",
  luau: "definitions/yaml/sparkdown-luau.language-grammar.yaml",
};

const RADIX_SOURCE = "/^@radix-ui[^a-z0-9-]/";
const RADIX_MESSAGE =
  "Import @radix-ui/* only inside packages/impower-ui; use the @impower/impower-ui component that wraps the primitive instead.";

const RADIX_SYNTAX = [
  { selector: `ImportExpression[source.value=${RADIX_SOURCE}]`, message: RADIX_MESSAGE },
  { selector: `ImportExpression[source.quasis.0.value.raw=${RADIX_SOURCE}]`, message: RADIX_MESSAGE },
  {
    selector: `CallExpression[callee.name="require"][arguments.0.value=${RADIX_SOURCE}]`,
    message: RADIX_MESSAGE,
  },
  { selector: `TSImportType[argument.literal.value=${RADIX_SOURCE}]`, message: RADIX_MESSAGE },
];

const IMPOWER_UI_SRC_SOURCE = "/(^|\\/)packages\\/impower-ui\\/src(\\/|$)/";
const IMPOWER_UI_SRC_MESSAGE =
  "Import impower-ui through its package entries (@impower/impower-ui/components, /layout and the rest of packages/impower-ui/package.json exports), never by relative path into packages/impower-ui/src.";

const IMPOWER_UI_SRC_SYNTAX = [
  { selector: `ImportExpression[source.value=${IMPOWER_UI_SRC_SOURCE}]`, message: IMPOWER_UI_SRC_MESSAGE },
  { selector: `ImportExpression[source.quasis.0.value.raw=${IMPOWER_UI_SRC_SOURCE}]`, message: IMPOWER_UI_SRC_MESSAGE },
  {
    selector: `CallExpression[callee.name="require"][arguments.0.value=${IMPOWER_UI_SRC_SOURCE}]`,
    message: IMPOWER_UI_SRC_MESSAGE,
  },
  { selector: `TSImportType[argument.literal.value=${IMPOWER_UI_SRC_SOURCE}]`, message: IMPOWER_UI_SRC_MESSAGE },
];

const HOST_FREE_FILES =["packages/spark-debug-adapter/**"];

const NODE_BUILTINS = builtinModules.filter((name) => /^[a-z][a-z0-9_]*$/.test(name));

const HOST_FREE_SOURCE = `/^(vscode|node:.*|(${NODE_BUILTINS.join("|")})([^a-z0-9_-].*)?)$/`;
const HOST_FREE_MESSAGE =
  "packages/spark-debug-adapter runs in a browser page as well as the extension host: import neither vscode nor a Node built-in there; take host services through a constructor option.";

const HOST_FREE_SYNTAX = [
  { selector: `ImportExpression[source.value=${HOST_FREE_SOURCE}]`, message: HOST_FREE_MESSAGE },
  { selector: `ImportExpression[source.quasis.0.value.raw=${HOST_FREE_SOURCE}]`, message: HOST_FREE_MESSAGE },
  {
    selector: `CallExpression[callee.name="require"][arguments.0.value=${HOST_FREE_SOURCE}]`,
    message: HOST_FREE_MESSAGE,
  },
  { selector: `TSImportType[argument.literal.value=${HOST_FREE_SOURCE}]`, message: HOST_FREE_MESSAGE },
];

const FORM_CONTROL_MESSAGE =
  "Render form controls only inside packages/impower-ui; use its Switch, Select, TextField or ChoiceGroup instead of a bare <input>, <select> or <textarea>.";

const FORM_CONTROL_SYNTAX = [
  {
    selector:
      'JSXOpeningElement[name.name=/^(select|textarea)$/], JSXOpeningElement[name.name="input"]:not(:has(JSXAttribute[name.name="type"][value.value="file"]))',
    message: FORM_CONTROL_MESSAGE,
  },
];

export const LEGACY_FORM_CONTROL_FILES = [
  "impower-dev/src/modules/spark-editor/components/assets/AddUrlDialog.tsx",
  "impower-dev/src/modules/spark-editor/components/desktop-shell/ProjectNameField.tsx",
  "impower-dev/src/modules/spark-editor/components/script-header/ScriptNameField.tsx",
];

export default [
  {
    ignores: ["**/dist/**", "**/out/**", "**/.tmp/**", "**/coverage/**"],
  },
  ...yml.configs["flat/base"],
  {
    files: Object.values(GRAMMAR_SOURCES),
    plugins: {
      "sparkdown-grammar": sparkdownGrammar,
    },
    settings: { "sparkdown-grammar": GRAMMAR_SOURCES },
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
      "no-restricted-syntax": ["error", ...RADIX_SYNTAX],
    },
  },
  {
    files: HOST_FREE_FILES,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ["vscode", ...NODE_BUILTINS].map((name) => ({ name, message: HOST_FREE_MESSAGE })),
          patterns: [
            { group: ["@radix-ui/*"], message: RADIX_MESSAGE },
            { group: ["node:*", ...NODE_BUILTINS.map((name) => `${name}/*`)], message: HOST_FREE_MESSAGE },
          ],
        },
      ],
      "no-restricted-syntax": ["error", ...RADIX_SYNTAX, ...HOST_FREE_SYNTAX],
    },
  },
  {
    files: ["impower-dev/**/*.{tsx,jsx}"],
    ignores: LEGACY_FORM_CONTROL_FILES,
    rules: {
      "no-restricted-syntax": ["error", ...RADIX_SYNTAX, ...FORM_CONTROL_SYNTAX],
    },
  },
  {
    files: ["impower-dev/src/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@radix-ui/*"], message: RADIX_MESSAGE },
            { regex: "(^|/)packages/impower-ui/src(/|$)", message: IMPOWER_UI_SRC_MESSAGE },
          ],
        },
      ],
      "no-restricted-syntax": ["error", ...RADIX_SYNTAX, ...IMPOWER_UI_SRC_SYNTAX],
    },
  },
  {
    files: ["impower-dev/src/**/*.{tsx,jsx}"],
    ignores: LEGACY_FORM_CONTROL_FILES,
    rules: {
      "no-restricted-syntax": ["error", ...RADIX_SYNTAX, ...IMPOWER_UI_SRC_SYNTAX, ...FORM_CONTROL_SYNTAX],
    },
  },
];
