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

const CONFIG_NAMES = [
  "sparkdown.language-config",
  "sparkdown-luau.language-config",
];
const CONFIG_BUILDS = CONFIG_NAMES.flatMap((name) =>
  outPaths.map((outPath) => ({
    inPath: `./yaml/${name}.yaml`,
    outPath: `${outPath}/${name}.json`,
  })),
);

const GRAMMAR_NAME = "sparkdown.language-grammar";
const IN_GRAMMAR_PATH = `./yaml/${GRAMMAR_NAME}.yaml`;
const IN_LUAU_GRAMMAR_PATH = `./yaml/sparkdown-luau.language-grammar.yaml`;
const LUAU_GRAMMAR_SECTIONS = ["variables", "repository"];
const OUT_GRAMMAR_PATHS = outPaths.map(
  (outPath) => `${outPath}/${GRAMMAR_NAME}.json`,
);

const SNIPPETS_NAMES = [
  "sparkdown.language-snippets",
  "sparkdown-luau.language-snippets",
];
const SNIPPETS_BUILDS = SNIPPETS_NAMES.flatMap((name) =>
  outPaths.map((outPath) => ({
    inPath: `./yaml/${name}.yaml`,
    outPath: `${outPath}/${name}.json`,
  })),
);

// The original code is licensed under the MIT License
// Copyright (c) Microsoft Corporation
// All rights reserved.

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

const LUAU_LISTS = new WeakMap<object, Set<string>>();

const wordList = (words: string[], boundary: "STORY_NAME" | "LUAU_NAME") =>
  `{{${boundary}_START}}(?:${words.join("|")}){{${boundary}_END}}`;

export const updateGrammarVariables = (
  grammar: TmGrammar,
  scopeReplacementRules?: VariableReplacer[],
) => {
  const variables = grammar.variables;
  const luauLists = LUAU_LISTS.get(grammar);

  const rawPatterns: Record<string, string> = {};
  for (const variableName in variables) {
    const variable = variables[variableName];
    if (variable) {
      rawPatterns[variableName] = Array.isArray(variable)
        ? wordList(variable, luauLists?.has(variableName) ? "LUAU_NAME" : "STORY_NAME")
        : variable;
    }
  }

  const MAX_PASSES = 32;
  const TOKEN_REGEX = /{{([A-Za-z_][A-Za-z0-9_]*)}}/g;
  const isFullyResolved = (s: string) => !TOKEN_REGEX.test(s);

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let changed = false;
    for (const name of Object.keys(rawPatterns)) {
      const before = rawPatterns[name]!;
      const after = before.replace(TOKEN_REGEX, (whole, refName: string) => {
        const ref = rawPatterns[refName];
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

  for (const [name, value] of Object.entries(rawPatterns)) {
    const stray = value.match(TOKEN_REGEX);
    if (stray) {
      throw new Error(
        `Grammar variable "${name}" references undefined variable(s): ${stray.join(", ")}`,
      );
    }
  }

  for (const [name, value] of Object.entries(rawPatterns)) {
    const captures = countCapturingGroups(value);
    const isUnderscoreWrapped = name.startsWith("_") && name.endsWith("_");
    if (captures > 0 && !isUnderscoreWrapped) {
      throw new Error(
        `Grammar variable "${name}" contains ${captures} capturing group(s) but its name isn't wrapped in underscores. ` +
          `Either change the capture(s) to non-capturing (\`(?:...)\`) or rename to \`_${name}_\` ` +
          `to signal at every use site that the variable adds capture indices to the host rule. ` +
          `See GRAMMAR.md §7.4.`,
      );
    }
    if (captures === 0 && isUnderscoreWrapped) {
      throw new Error(
        `Grammar variable "${name}" is underscore-wrapped (which signals "contains capture groups") ` +
          `but its resolved value has no capturing groups. Rename to drop the underscores. ` +
          `See GRAMMAR.md §7.4.`,
      );
    }
  }

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

  checkNoZeroWidthInPatterns(grammar);

  return grammar;
};

function checkNoZeroWidthInPatterns(grammar: TmGrammar): void {
  const repo = (grammar.repository ?? {}) as Record<string, unknown>;

  const zeroWidthMatches = new Set<string>();
  for (const [name, rule] of Object.entries(repo)) {
    if (!rule || typeof rule !== "object") continue;
    const match = (rule as { match?: unknown }).match;
    if (typeof match !== "string") continue;
    if (isUnconditionallyZeroWidth(match)) zeroWidthMatches.add(name);
  }

  const effectivelyZeroWidth = new Set(zeroWidthMatches);
  const isSwitchOnly = (rule: Record<string, unknown>): boolean =>
    Array.isArray(rule["patterns"]) &&
    typeof rule["match"] !== "string" &&
    typeof rule["begin"] !== "string" &&
    typeof rule["end"] !== "string";

  for (let pass = 0; pass < Object.keys(repo).length + 1; pass++) {
    let changed = false;
    for (const [name, rule] of Object.entries(repo)) {
      if (effectivelyZeroWidth.has(name)) continue;
      if (!rule || typeof rule !== "object") continue;
      const r = rule as Record<string, unknown>;
      if (!isSwitchOnly(r)) continue;
      const patterns = r["patterns"] as unknown[];
      const includesZW = patterns.some((entry) => {
        if (!entry || typeof entry !== "object") return false;
        const include = (entry as { include?: unknown }).include;
        if (typeof include !== "string" || !include.startsWith("#")) {
          return false;
        }
        return effectivelyZeroWidth.has(include.slice(1));
      });
      if (includesZW) {
        effectivelyZeroWidth.add(name);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const offenders: Array<{ host: string; offender: string }> = [];
  const visitPatterns = (host: string, patterns: unknown): void => {
    if (!Array.isArray(patterns)) return;
    for (const entry of patterns) {
      if (!entry || typeof entry !== "object") continue;
      const include = (entry as { include?: unknown }).include;
      if (typeof include === "string" && include.startsWith("#")) {
        const target = include.slice(1);
        if (effectivelyZeroWidth.has(target)) {
          offenders.push({ host, offender: target });
        }
      } else {
        visitNested(host, entry);
      }
    }
  };
  const visitNested = (host: string, rule: unknown): void => {
    if (!rule || typeof rule !== "object") return;
    const r = rule as Record<string, unknown>;
    if (Array.isArray(r["patterns"])) visitPatterns(host, r["patterns"]);
  };
  for (const [name, rule] of Object.entries(repo)) {
    if (!rule || typeof rule !== "object") continue;
    visitNested(name, rule);
  }
  if (Array.isArray(grammar.patterns)) {
    visitPatterns("<root>", grammar.patterns);
  }
  if (offenders.length > 0) {
    const summary = offenders
      .map((o) => `  - "${o.host}" includes zero-width "${o.offender}"`)
      .join("\n");
    throw new Error(
      `Grammar build: ${offenders.length} rule(s) include a zero-width-matchable rule in their \`patterns:\` list:\n${summary}\n\n` +
        `A zero-width-matchable rule (e.g. \`OptionalWhitespace\` with \`match: ({{WS}}*)\`) in a \`patterns:\` list causes the parser to loop with no progress. ` +
        `Use \`ExtraWhitespace\` / \`RequiredWhitespace\` / \`Whitespace\` (all use \`{{WS}}+\`) inside \`patterns:\`; reserve zero-width rules for capture targets. See GRAMMAR.md §12.`,
    );
  }
}

function isUnconditionallyZeroWidth(source: string): boolean {
  const PROBES = ["x", " ", "\n", "(", "1"];
  try {
    const re = new RegExp(source, "y");
    for (const probe of PROBES) {
      re.lastIndex = 0;
      const m = re.exec(probe);
      if (m !== null && m[0] === "" && re.lastIndex === 0) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

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

function countCapturingGroups(pattern: string): number {
  let count = 0;
  let inCharClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!;
    if (ch === "\\") {
      i++;
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
      const next = pattern[i + 1];
      if (next !== "?") {
        count++;
        continue;
      }
      const after = pattern[i + 2];
      if (after === ":" || after === "=" || after === "!") {
        continue;
      }
      if (after === "<") {
        const after2 = pattern[i + 3];
        if (after2 === "=" || after2 === "!") {
          continue;
        }
        count++;
        continue;
      }
      if (after === "P") {
        count++;
        continue;
      }
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

const applyDefaultMatchToRule = (rule: any): void => {
  if (!rule || typeof rule !== "object" || Array.isArray(rule)) return;
  const emitsScope =
    typeof rule["name"] === "string" ||
    typeof rule["tag"] === "string" ||
    (typeof rule["captures"] === "object" && rule["captures"] !== null);
  const hasMatchShape =
    typeof rule["match"] === "string" ||
    typeof rule["begin"] === "string" ||
    typeof rule["include"] === "string" ||
    Array.isArray(rule["patterns"]);
  if (emitsScope && !hasMatchShape) {
    rule["match"] = "(.+)";
  }
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

const generatedWarning = (
  inYamlPaths: string | string[],
  outJsonPath: string,
) => {
  const yamlRels = [inYamlPaths].flat().map((inYamlPath) =>
    path.relative(path.dirname(outJsonPath), inYamlPath).replace(/\\/g, "/"),
  );
  return [
    `Generated from ${yamlRels.join(" and ")} by @impower/definitions.`,
    `Do NOT edit this JSON file directly — your changes will be lost on the next build.`,
    `Edit the YAML source instead, then run \`npm run language\` from definitions/.`,
  ];
};

const writeJson = async (
  parsed: TmGrammar,
  inYamlPaths: string | string[],
  outJsonPath: string,
) => {
  applyDefaultMatch(parsed);
  const resolved = updateGrammarVariables(parsed);
  const stamped = {
    _generated_: generatedWarning(inYamlPaths, outJsonPath),
    ...resolved,
  };
  const json = JSON.stringify(stamped, null, 2);
  await fs.promises.writeFile(outJsonPath, json);
};

const buildJson = async (inYamlPath: string, outJsonPath: string) => {
  const text = await fs.promises.readFile(inYamlPath, "utf8");
  await writeJson(YAML.parse(text), inYamlPath, outJsonPath);
};

const readGrammarSource = async () => {
  const story = YAML.parse(await fs.promises.readFile(IN_GRAMMAR_PATH, "utf8"));
  const luau = YAML.parse(
    await fs.promises.readFile(IN_LUAU_GRAMMAR_PATH, "utf8"),
  );
  const foreign = Object.keys(luau ?? {}).filter(
    (key) => !LUAU_GRAMMAR_SECTIONS.includes(key),
  );
  if (foreign.length > 0) {
    throw new Error(
      `Grammar build: ${IN_LUAU_GRAMMAR_PATH} may hold only ${LUAU_GRAMMAR_SECTIONS.join(" and ")}; ` +
        `move ${foreign.join(", ")} to ${IN_GRAMMAR_PATH}`,
    );
  }
  LUAU_LISTS.set(
    story,
    new Set(Object.keys(luau?.variables ?? {}).filter((name) => Array.isArray(luau.variables[name]))),
  );
  for (const section of LUAU_GRAMMAR_SECTIONS) {
    const twice = Object.keys(luau?.[section] ?? {}).filter((name) =>
      Object.hasOwn(story[section] ?? {}, name),
    );
    if (twice.length > 0) {
      throw new Error(
        `Grammar build: ${section} defined in both ${IN_GRAMMAR_PATH} and ${IN_LUAU_GRAMMAR_PATH}: ${twice.join(", ")}`,
      );
    }
    story[section] = { ...story[section], ...luau?.[section] };
  }
  return story;
};

const buildGrammarJson = async (outJsonPath: string) => {
  await writeJson(
    await readGrammarSource(),
    [IN_GRAMMAR_PATH, IN_LUAU_GRAMMAR_PATH],
    outJsonPath,
  );
};

const LUAU_FILE_GRAMMAR_NAME = "sparkdown-luau.language-grammar";

const buildLuauFileGrammarJson = async (outGrammarPath: string) => {
  const parsed = await readGrammarSource();
  const root = parsed.luauFile;
  if (!root?.rule || !parsed.repository?.[root.rule]) {
    throw new Error(
      `Grammar build: the grammar's \`luauFile.rule\` must name a rule of its repository (got ${JSON.stringify(root?.rule)})`,
    );
  }
  const outJsonPath = path.join(
    path.dirname(outGrammarPath),
    `${LUAU_FILE_GRAMMAR_NAME}.json`,
  );
  const grammar = {
    _generated_: generatedWarning(IN_GRAMMAR_PATH, outJsonPath),
    name: root.name,
    scopeName: root.scopeName,
    fileTypes: root.fileTypes,
    patterns: [{ include: `${parsed.scopeName}#${root.rule}` }],
  };
  await fs.promises.writeFile(outJsonPath, JSON.stringify(grammar, null, 2));
};

const LAYOUT_VERBS_MODULE_NAME = "sparkdown.layout-verbs";

const buildLayoutVerbsModule = async (outGrammarPath: string) => {
  const parsed = await readGrammarSource();
  const verbs: unknown = parsed.variables?.LAYOUT_CONTROL_KEYWORDS;
  if (
    !Array.isArray(verbs) ||
    verbs.length === 0 ||
    !verbs.every((verb) => typeof verb === "string" && /^[a-z]+$/.test(verb))
  ) {
    throw new Error(
      `Grammar build: the grammar's \`variables.LAYOUT_CONTROL_KEYWORDS\` must be a non-empty list of lowercase words (got ${JSON.stringify(verbs)})`,
    );
  }
  const outModulePath = path.join(
    path.dirname(outGrammarPath),
    `${LAYOUT_VERBS_MODULE_NAME}.ts`,
  );
  const source = [
    `export const LAYOUT_VERBS = [${verbs.map((verb) => JSON.stringify(verb)).join(", ")}] as const;`,
    ``,
    `export type LayoutVerb = (typeof LAYOUT_VERBS)[number];`,
    ``,
    `export const LayoutVerb = {`,
    ...verbs.map((verb) => `  ${verb}: ${JSON.stringify(verb)},`),
    `} as const satisfies { [V in LayoutVerb]: V };`,
    ``,
    `export const isLayoutVerb = (value: string): value is LayoutVerb =>`,
    `  (LAYOUT_VERBS as readonly string[]).includes(value);`,
    ``,
  ].join("\n");
  await fs.promises.writeFile(outModulePath, source);
};

const build = async () => {
  console.log(LOG_PREFIX + `build started`);
  await Promise.all(
    CONFIG_BUILDS.map(({ inPath, outPath }) => buildJson(inPath, outPath)),
  );
  await Promise.all(
    OUT_GRAMMAR_PATHS.map((outPath) => buildGrammarJson(outPath)),
  );
  await Promise.all(
    OUT_GRAMMAR_PATHS.map((outPath) => buildLuauFileGrammarJson(outPath)),
  );
  await Promise.all(
    OUT_GRAMMAR_PATHS.map((outPath) => buildLayoutVerbsModule(outPath)),
  );
  await Promise.all(
    SNIPPETS_BUILDS.map(({ inPath, outPath }) => buildJson(inPath, outPath)),
  );
  console.log(LOG_PREFIX + `build finished`);
};

build().catch((err) => {
  console.error(err);
  process.exitCode = 1;
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
