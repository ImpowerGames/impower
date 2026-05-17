import * as chokidar from "chokidar";
import fs from "fs";
import path from "path";
import YAML from "yaml";

const outPaths = process.argv.slice(2).filter((path) => !path.startsWith("--"));
const WATCH = process.argv.includes("--watch");

const LOG_PREFIX =
  (WATCH ? "[watch] " : "") + `${path.basename(process.cwd())}: `;

console.log(LOG_PREFIX + "Propagating definitions...");

const WATCH_PATH = `./yaml`;

const CONFIG_NAME = "sparkdown.language-config";
const IN_CONFIG_PATH = `./yaml/${CONFIG_NAME}.yaml`;
const OUT_CONFIG_PATHS = outPaths.map(
  (outPath) => `${outPath}/${CONFIG_NAME}.json`,
);

const GRAMMAR_NAME = "sparkdown.language-grammar";
const IN_GRAMMAR_PATH = `./yaml/${GRAMMAR_NAME}.yaml`;
const OUT_GRAMMAR_PATHS = outPaths.map(
  (outPath) => `${outPath}/${GRAMMAR_NAME}.json`,
);

const SNIPPETS_NAME = "sparkdown.language-snippets";
const IN_SNIPPETS_PATH = `./yaml/${SNIPPETS_NAME}.yaml`;
const OUT_SNIPPETS_PATHS = outPaths.map(
  (outPath) => `${outPath}/${SNIPPETS_NAME}.json`,
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
  variables: MapLike<string | string[]>;
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
  scopeReplacementRules?: VariableReplacer[],
) => {
  const variables = grammar.variables;

  // First pass: build the raw (un-substituted) pattern for each variable.
  // Arrays auto-wrap to `\b(?:a|b|c)\b` here; string values pass through.
  const rawPatterns: Record<string, string> = {};
  for (const variableName in variables) {
    const variable = variables[variableName];
    if (variable) {
      rawPatterns[variableName] = Array.isArray(variable)
        ? `\\b(?:${variable.join("|")})\\b`
        : variable;
    }
  }

  // Second pass: fixed-point substitution. Resolution is order-independent —
  // any variable can reference any other regardless of declaration position.
  // Each pass substitutes every `{{name}}` token whose value is already a
  // *resolved* pattern (no remaining `{{...}}` tokens of its own). We loop
  // until a full pass makes no changes. Circular references would loop
  // forever, so a hard cap turns them into a build error instead.
  const MAX_PASSES = 32;
  const TOKEN_REGEX = /{{([A-Za-z_][A-Za-z0-9_]*)}}/g;
  const isFullyResolved = (s: string) => !TOKEN_REGEX.test(s);

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let changed = false;
    for (const name of Object.keys(rawPatterns)) {
      const before = rawPatterns[name]!;
      // Reset lastIndex because TOKEN_REGEX is global; reuse via replace.
      const after = before.replace(TOKEN_REGEX, (whole, refName: string) => {
        const ref = rawPatterns[refName];
        // Only substitute when the referenced value is itself fully resolved.
        // Otherwise leave the token for a later pass — substituting a
        // half-resolved value would compound the problem.
        return ref !== undefined && isFullyResolved(ref) ? ref : whole;
      });
      if (after !== before) {
        rawPatterns[name] = after;
        changed = true;
      }
    }
    if (!changed) break;
    if (pass === MAX_PASSES - 1) {
      const unresolved = Object.entries(rawPatterns)
        .filter(([, v]) => !isFullyResolved(v))
        .map(([k]) => k);
      throw new Error(
        `Grammar variable substitution failed to converge after ${MAX_PASSES} passes. ` +
          `Likely circular reference among: ${unresolved.join(", ")}.`,
      );
    }
  }

  // Catch typos: any remaining `{{...}}` token references a name we never
  // saw a definition for. Fail loud instead of silently leaving a literal
  // `{{FOO}}` in the compiled grammar (which would break regex matching).
  for (const [name, value] of Object.entries(rawPatterns)) {
    const stray = value.match(TOKEN_REGEX);
    if (stray) {
      throw new Error(
        `Grammar variable "${name}" references undefined variable(s): ${stray.join(", ")}`,
      );
    }
  }

  // Build the replacer list now that all values are fully resolved.
  const variableReplacers: VariableReplacer[] = Object.entries(rawPatterns).map(
    ([name, value]) => [new RegExp(`{{${name}}}`, "gim"), value],
  );

  transformGrammarRepository(grammar, ["begin", "end", "match"], (pattern) =>
    replacePatternVariables(pattern, variableReplacers),
  );

  if (scopeReplacementRules) {
    transformGrammarRepository(grammar, ["name"], (pattern) =>
      replaceScopes(pattern, scopeReplacementRules),
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
  variableReplacers: VariableReplacer[],
) => {
  let result = pattern;
  for (const [variableName, value] of variableReplacers) {
    result = result.replace(variableName, value);
  }
  return result;
};

const replaceScopes = (
  pattern: string,
  scopeReplacementRules: VariableReplacer[],
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
  replaceScopes?: (ruleProperty: string) => string,
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
  transformProperty: (ruleProperty: string) => string,
) => {
  for (const propertyName of propertyNames) {
    const value = rule?.[propertyName];
    if (typeof value === "string") {
      rule[propertyName] = transformProperty(value);
    }
  }

  for (const propertyName in rule) {
    const value = rule?.[propertyName];
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
  console.log(LOG_PREFIX + `build started`);
  await Promise.all(
    OUT_CONFIG_PATHS.map((outPath) => buildJson(IN_CONFIG_PATH, outPath)),
  );
  await Promise.all(
    OUT_GRAMMAR_PATHS.map((outPath) => buildJson(IN_GRAMMAR_PATH, outPath)),
  );
  await Promise.all(
    OUT_SNIPPETS_PATHS.map((outPath) => buildJson(IN_SNIPPETS_PATH, outPath)),
  );
  console.log(LOG_PREFIX + `build finished`);
};

build().catch((err) => {
  console.error(err);
});

if (WATCH) {
  chokidar
    .watch(WATCH_PATH, {
      ignoreInitial: true,
      persistent: true,
      depth: 99,
    })
    .on("all", async (event, filePath) => {
      console.log(
        LOG_PREFIX + `detected ${event} in ${filePath}, rebuilding...`,
      );
      await build().catch((err) => {
        console.error(err);
      });
    });
}
