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

// Parts of file were originally extracted from the
// TypeScript-TMLanguage project.
// https://github.com/Microsoft/TypeScript-TmLanguage
//
// The original code is licensed under the MIT License
// Copyright (c) Microsoft Corporation
// All rights reserved.

// tslint:disable:no-shadowed-variable
// tslint:disable:forin

export type VariableReplacer = [RegExp, string];

declare interface MapLike<T> {
  [s: string]: T;
}

declare interface TmGrammarRuleName {
  name: string;
}

declare interface TmGrammarRule {
  name?: string;
}
declare interface TmGrammarMatchRule extends TmGrammarRule {
  match: string;
  captures: MapLike<TmGrammarRuleName>;
}
declare interface TmGrammarBeginEndRule extends TmGrammarRule {
  contentName?: string;
  begin: string;
  end: string;
  beginCaptures?: MapLike<TmGrammarRuleName>;
  endCaptures?: MapLike<TmGrammarRuleName>;
  patterns: AnyTmGrammarRule[];
}
declare interface TmGrammarIncludeRule extends TmGrammarRule {
  include: string;
}
declare type AnyTmGrammarRule =
  | TmGrammarMatchRule
  | TmGrammarBeginEndRule
  | TmGrammarIncludeRule;
declare interface TmGrammarRepositoryPatterns {
  patterns: AnyTmGrammarRule[];
}
declare type TmGrammarRepositaryRule =
  | AnyTmGrammarRule
  | TmGrammarRepositoryPatterns;
declare interface TmGrammar {
  name: string;
  scopeName: string;
  fileTypes: string[];
  uuid: string;
  variables: MapLike<string>;
  patterns?: AnyTmGrammarRule[];
  repository: MapLike<TmGrammarRepositaryRule>;
}

declare interface TmThemeSetting {
  scope: string;
  settings: { vsclassificationtype: string };
}
declare interface TmTheme {
  name: string;
  uuid: string;
  settings: TmThemeSetting[];
}

/* ************************************************************************** */

/**
 * Replace all the patterns (`{{variableName}}`) with the values defined in
 * `grammar.variables`.
 *
 * @param grammar the grammar to transform
 * @param scopeReplacementRules an optional set of rules used to
 *                              replace entire scopes.
 */
export const updateGrammarVariables = (
  grammar: TmGrammar,
  scopeReplacementRules?: VariableReplacer[]
) => {
  // Keep a copy of the variable for later use and delete them from the grammar.
  const variables = grammar.variables;

  const variableReplacers: VariableReplacer[] = [];
  for (const variableName in variables) {
    const variable = variables[variableName];
    if (variable) {
      // Replace the pattern with earlier variables
      const pattern = replacePatternVariables(variable, variableReplacers);

      // When a variable is resolved, it's added to replacers. Then it can be used
      // if another variable depends on it.
      variableReplacers.push([
        new RegExp(`{{${variableName}}}`, "gim"),
        pattern,
      ]);
    }
  }

  transformGrammarRepository(grammar, ["begin", "end", "match"], (pattern) =>
    replacePatternVariables(pattern, variableReplacers)
  );

  if (scopeReplacementRules) {
    transformGrammarRepository(grammar, ["name"], (pattern) =>
      replaceScopes(pattern, scopeReplacementRules)
    );
  }

  return grammar;
};

/**
 * If a declared variable itself depends on other variables, this
 * function performs the substitutions, so that the variable is
 * fully resolved.
 *
 * @param pattern the variable name
 * @param variableReplacers a list of replacers, which is expected to
 *                          grow each time a new variable is resolved.
 */
const replacePatternVariables = (
  pattern: string,
  variableReplacers: VariableReplacer[]
) => {
  let result = pattern;
  for (const [variableName, value] of variableReplacers) {
    result = result.replace(variableName, value);
  }
  return result;
};

const replaceScopes = (
  pattern: string,
  scopeReplacementRules: VariableReplacer[]
) => {
  let result = pattern;
  for (const [variableName, value] of scopeReplacementRules) {
    result = result.replace(variableName, value);
  }
  return result;
};

/**
 * In each rule of the repository, substitute variables for the given
 * `propertyNames` using `transformProperty`.
 *
 * @param grammar
 * @param propertyNames
 * @param transformProperty
 */
const transformGrammarRepository = (
  grammar: TmGrammar,
  propertyNames: string[],
  transformProperty: (ruleProperty: string) => string,
  replaceScopes?: (ruleProperty: string) => string
) => {
  const repository = grammar.repository;
  for (const key in repository) {
    const rule = repository[key];
    if (rule) {
      transformGrammarRule(rule, propertyNames, transformProperty);
    }
  }

  if (replaceScopes) {
    for (const key in repository) {
      const rule = repository[key];
      if (rule) {
        transformGrammarRule(rule, propertyNames, replaceScopes);
      }
    }
  }
};

/**
 * Look into the `rule` and then recursively perform transformations for
 * the given `propertyNames` using `transformProperty`.
 *
 * @param rule
 * @param propertyNames
 * @param transformProperty
 */
const transformGrammarRule = (
  rule: Record<string, any>,
  propertyNames: string[],
  transformProperty: (ruleProperty: string) => string
) => {
  for (const propertyName of propertyNames) {
    const value = rule[propertyName];
    if (typeof value === "string") {
      rule[propertyName] = transformProperty(value);
    }
  }

  for (const propertyName in rule) {
    const value = rule[propertyName];
    if (typeof value === "object") {
      transformGrammarRule(value, propertyNames, transformProperty);
    }
  }
};

const buildJson = async (inYamlPath: string, outJsonPath: string) => {
  const text = await fs.promises.readFile(inYamlPath, "utf8");
  const parsed = YAML.parse(text);
  const resolved = updateGrammarVariables(parsed);
  const json = JSON.stringify(resolved, null, 2);
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
