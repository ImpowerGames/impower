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

  // Enforce the naming convention for capturing variables: any variable
  // whose value contains an unescaped *capturing* group `(...)` must have
  // a name wrapped in underscores like `_NAME_`. The underscore wrap is a
  // visible flag at every call site that "this variable adds capture
  // group(s) to the host rule's regex." See GRAMMAR.md §4.4.
  //
  // The check is build-time-only — it doesn't affect parsing, just refuses
  // to compile a grammar that violates the convention. Both directions
  // are checked: a capturing-but-not-underscored variable AND an
  // underscored-but-not-capturing variable both throw.
  for (const [name, value] of Object.entries(rawPatterns)) {
    const captures = countCapturingGroups(value);
    const isUnderscoreWrapped = name.startsWith("_") && name.endsWith("_");
    if (captures > 0 && !isUnderscoreWrapped) {
      throw new Error(
        `Grammar variable "${name}" contains ${captures} capturing group(s) but its name isn't wrapped in underscores. ` +
          `Either change the capture(s) to non-capturing (\`(?:...)\`) or rename to \`_${name}_\` ` +
          `to signal at every use site that the variable adds capture indices to the host rule. ` +
          `See GRAMMAR.md §4.4.`,
      );
    }
    if (captures === 0 && isUnderscoreWrapped) {
      throw new Error(
        `Grammar variable "${name}" is underscore-wrapped (which signals "contains capture groups") ` +
          `but its resolved value has no capturing groups. Rename to drop the underscores. ` +
          `See GRAMMAR.md §4.4.`,
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

/**
 * Counts unescaped *capturing* groups in a regex source string. Capturing
 * groups are `(` followed by a non-special char — i.e. NOT `(?:`, `(?=`,
 * `(?!`, `(?<=`, `(?<!`, `(?<name>` (Python-style named — we treat these
 * as capturing too since they take a capture-index slot), or backslash-
 * escaped `\(`. Character-class parens `[(...]` don't count because `(`
 * inside a character class is literal.
 *
 * Used by `updateGrammarVariables` to enforce the underscore-wrap naming
 * convention for variables that contain captures (see GRAMMAR.md §4.4).
 */
function countCapturingGroups(pattern: string): number {
  let count = 0;
  let inCharClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!;
    // Skip escaped characters: `\(`, `\)`, `\[`, `\]`, etc. don't carry
    // their structural meaning.
    if (ch === "\\") {
      i++; // skip the next char regardless of what it is
      continue;
    }
    if (inCharClass) {
      if (ch === "]") inCharClass = false;
      continue;
    }
    if (ch === "[") {
      inCharClass = true;
      continue;
    }
    if (ch === "(") {
      // Non-capturing constructs: `(?:`, `(?=`, `(?!`, `(?<=`, `(?<!`.
      // Named captures `(?<name>...)` and `(?P<name>...)` DO take an index
      // so we count them as capturing.
      const next = pattern[i + 1];
      if (next !== "?") {
        count++;
        continue;
      }
      const after = pattern[i + 2];
      if (after === ":" || after === "=" || after === "!") {
        // non-capturing or lookahead — skip
        continue;
      }
      if (after === "<") {
        const after2 = pattern[i + 3];
        if (after2 === "=" || after2 === "!") {
          // lookbehind — skip
          continue;
        }
        // `(?<name>...)` — named capture, counts.
        count++;
        continue;
      }
      if (after === "P") {
        // `(?P<name>...)` Python-style — named capture, counts.
        count++;
        continue;
      }
      // `(?...)` with an unrecognized modifier — treat conservatively as
      // capturing so suspicious patterns trip the check rather than slip.
      count++;
    }
  }
  return count;
}

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
 * Auto-fills `match: (.+)` for any *named* rule that doesn't already
 * provide its own matching shape. A rule counts as "needing the default"
 * when it has a `name` or `tag` (so it emits a scope/node) but lacks every
 * form of pattern source: `match`, `begin`, `patterns`, and `include`.
 *
 * The default is the most common marker-rule shape in this grammar — see
 * the dozens of `match: (.+)` lines on simple keyword/punctuation rules —
 * so this lets authors omit the boilerplate and write just:
 *
 *   IncludeKeyword:
 *     tag: controlKeyword
 *     name: keyword.control.definition.include.sd
 *
 * Applies to top-level `repository:` entries and to each rule inside any
 * nested `patterns:` array. Deliberately does NOT recurse into `captures:`
 * / `beginCaptures:` / `endCaptures:` — capture entries are positional
 * scope assignments, not rules; a `match` on them would be meaningless.
 *
 * Runs *before* `updateGrammarVariables` so the inserted `match` still
 * passes through variable substitution (currently a no-op for `(.+)`, but
 * keeps the pipeline order uniform).
 */
const applyDefaultMatchToRule = (rule: any): void => {
  if (!rule || typeof rule !== "object" || Array.isArray(rule)) return;
  const isNamed =
    typeof rule["name"] === "string" || typeof rule["tag"] === "string";
  const hasMatchShape =
    typeof rule["match"] === "string" ||
    typeof rule["begin"] === "string" ||
    typeof rule["include"] === "string" ||
    Array.isArray(rule["patterns"]);
  if (isNamed && !hasMatchShape) {
    rule["match"] = "(.+)";
  }
  // Recurse only into nested rule lists. A rule's `patterns:` is the only
  // place sub-rules live; captures are scope assignments, not rules.
  if (Array.isArray(rule["patterns"])) {
    for (const child of rule["patterns"]) applyDefaultMatchToRule(child);
  }
};

const applyDefaultMatch = (grammar: TmGrammar): void => {
  const repository = grammar.repository;
  if (repository) {
    for (const key of Object.keys(repository)) {
      applyDefaultMatchToRule(repository[key]);
    }
  }
  if (Array.isArray(grammar.patterns)) {
    for (const child of grammar.patterns) applyDefaultMatchToRule(child);
  }
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
  applyDefaultMatch(parsed);
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
