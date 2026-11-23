import { builtinModules } from "node:module";
import tsParser from "@typescript-eslint/parser";
import yml from "eslint-plugin-yml";
import sparkdownGrammar from "./packages/eslint-plugin-sparkdown-grammar/src/index.ts";

const SCRIPT_FILES = ["**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"];

const GRAMMAR_SOURCES = {
  story: "definitions/yaml/sparkdown.language-grammar.yaml",
  luau: "definitions/yaml/sparkdown-luau.language-grammar.yaml",
};

const importFormSyntax = (source, message) =>
  [
    `ImportDeclaration[source.value=${source}]`,
    `ExportNamedDeclaration[source.value=${source}]`,
    `ExportAllDeclaration[source.value=${source}]`,
    `TSImportEqualsDeclaration[moduleReference.expression.value=${source}]`,
    `ImportExpression[source.value=${source}]`,
    `ImportExpression[source.quasis.0.value.raw=${source}]`,
    `CallExpression[callee.name="require"][arguments.0.value=${source}]`,
    `CallExpression[callee.name="require"][arguments.0.quasis.0.value.raw=${source}]`,
    `TSImportType[argument.literal.value=${source}]`,
  ].map((selector) => ({ selector, message }));

const RADIX_SYNTAX = importFormSyntax(
  "/^@radix-ui[^a-z0-9-]/",
  "Import @radix-ui/* only inside packages/impower-ui; use the @impower/impower-ui component that wraps the primitive instead.",
);

const IMPOWER_UI_SRC_SYNTAX = importFormSyntax(
  "/(^|\\/)packages\\/impower-ui\\/src(\\/|$)/",
  "Import impower-ui through its package entries (@impower/impower-ui/components, /layout and the rest of packages/impower-ui/package.json exports), never by relative path into packages/impower-ui/src.",
);

const HOST_FREE_FILES = ["packages/spark-debug-adapter/**"];

const NODE_BUILTINS = builtinModules.filter((name) => /^[a-z][a-z0-9_]*$/.test(name));

const HOST_FREE_SYNTAX = importFormSyntax(
  `/^(vscode|node:.*|(${NODE_BUILTINS.join("|")})([^a-z0-9_-].*)?)$/`,
  "packages/spark-debug-adapter runs in a browser page as well as the extension host: import neither vscode nor a Node built-in there; take host services through a constructor option.",
);

const FORM_CONTROL_MESSAGE =
  "Render form controls only inside packages/impower-ui; use its Switch, Select, TextField or ChoiceGroup instead of a bare <input>, <select> or <textarea>.";

const FORM_CONTROL_SYNTAX = [
  {
    selector:
      'JSXOpeningElement[name.name=/^(select|textarea)$/], JSXOpeningElement[name.name="input"]:not(:has(JSXAttribute[name.name="type"][value.value="file"]))',
    message: FORM_CONTROL_MESSAGE,
  },
];

const BUTTON_DIALOG_MESSAGE =
  'Render buttons, dialogs and menus only inside packages/impower-ui; use its Button, Dialog, DockedDialog, Popover or Dropdown instead of a bare <button> or a hand-written role="dialog", "menu" or "menuitem".';

const BUTTON_DIALOG_ROLES = "/^(dialog|menu|menuitem)$/";

const BUTTON_DIALOG_SYNTAX = [
  {
    selector: [
      'JSXOpeningElement[name.name="button"]',
      `JSXAttribute[name.name="role"][value.value=${BUTTON_DIALOG_ROLES}]`,
      `JSXAttribute[name.name="role"] > JSXExpressionContainer > Literal[value=${BUTTON_DIALOG_ROLES}]`,
      `JSXAttribute[name.name="role"] > JSXExpressionContainer > TemplateLiteral[expressions.length=0] > TemplateElement[value.raw=${BUTTON_DIALOG_ROLES}]`,
    ].join(", "),
    message: BUTTON_DIALOG_MESSAGE,
  },
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
      "no-restricted-syntax": ["error", ...RADIX_SYNTAX],
    },
  },
  {
    files: HOST_FREE_FILES,
    rules: {
      "no-restricted-syntax": ["error", ...RADIX_SYNTAX, ...HOST_FREE_SYNTAX],
    },
  },
  {
    files: ["impower-dev/**/*.{tsx,jsx}"],
    rules: {
      "no-restricted-syntax": ["error", ...RADIX_SYNTAX, ...FORM_CONTROL_SYNTAX, ...BUTTON_DIALOG_SYNTAX],
    },
  },
  {
    files: ["impower-dev/src/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"],
    rules: {
      "no-restricted-syntax": ["error", ...RADIX_SYNTAX, ...IMPOWER_UI_SRC_SYNTAX],
    },
  },
  {
    files: ["impower-dev/src/**/*.{tsx,jsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...RADIX_SYNTAX,
        ...IMPOWER_UI_SRC_SYNTAX,
        ...FORM_CONTROL_SYNTAX,
        ...BUTTON_DIALOG_SYNTAX,
      ],
    },
  },
];
