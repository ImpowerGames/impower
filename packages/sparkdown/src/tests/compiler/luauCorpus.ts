// The corpus the Luau corpus gate reads (#1908): every vendored upstream Luau
// snippet, found rather than listed, each as the document Sparkdown compiles
// and the Luau the official parser reads.
//
// - `conformance/<file>.luau`: the upstream conformance files, as
//   `luauInputs` reads and wraps them.
// - `typecheck/<file>/<case>`: every source the ports of Luau's type-checker
//   tests carry (`../luau-conformance/typecheck/`), and each module source a
//   check supplies. The port files hand their cases to `portUpstreamFile`;
//   the gate captures them there, so a source built in TypeScript is read as
//   the port builds it. Definition files (`declare`) are not Luau statements
//   and are left out.
// - `lint/<file>/<case>`: the snippets of the ports of Luau's linter tests
//   (`../luau-conformance/Lint*.test.ts`), each a literal handed to a helper
//   that places it in a function (`lintInFunction` and the like) in a group
//   marked `// Luau: <case>`. Groups marked as Sparkdown's own are left out.
// - `autocomplete/<file>/<case>`: the documents of the cases the language
//   server's autocomplete tests port verbatim (`ported` in
//   `autocompleteUpstreamCases.ts`), with the `@N` cursor markers removed.
//   Upstream writes them at the top of a module, and the ports place them in
//   a function, so the input is that function, the first at column 0 through
//   the first `end` at column 0, without any Sparkdown declarations around
//   it. It is its own Luau. A document with no such function is not read.
//
// Every other snippet is placed in a function as the conformance harness
// places a fixture (`wrapConformanceSource`), with the same Luau handed to
// the official parser (`conformanceLuau`). The conformance files keep the
// harness's `function run()`. A type-checker or linter snippet is a module,
// whose chunk takes `...`, so its function is `function run(...)`.
//
// The lint and autocomplete ports are test files that register tests as they
// load, so their snippets are read from the files' syntax: only a literal
// argument is a snippet, and a literal with `${}` substitutions is not read.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { wrapConformanceSource } from "../luau-conformance/conformanceTestHarness";
import type { PortedCase } from "../luau-conformance/typecheck/portedCases";
import { UPSTREAM_CASES as AUTOCOMPLETE_CASES } from "../../../../sparkdown-language-server/src/tests/providers/autocompleteUpstreamCases";
import { conformanceLuau, luauInputs } from "./luauFixtures";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LINT_ROOT = join(__dirname, "..", "luau-conformance");
const AUTOCOMPLETE_ROOT = join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "sparkdown-language-server",
  "src",
  "tests",
  "providers",
);

export type CorpusSource = "conformance" | "typecheck" | "lint" | "autocomplete";

export interface CorpusInput {
  /** `<source>/<file>/<case>`, with `#N` when a name recurs. */
  name: string;
  source: CorpusSource;
  /** The document Sparkdown compiles. */
  text: string;
  /** The same Luau as the official parser reads it. */
  luau: string;
  /** Where the function that holds the snippet starts in `text`. */
  functionStart: number;
  /** Where that function's own `end` ends in `text`. */
  functionEnd: number;
}

/**
 * How many inputs each source yields. A port that loses snippets, or a
 * re-vendor that drops files, changes a count, and the gate fails until the
 * count here is changed with it.
 */
export const CORPUS_INVENTORY: Record<CorpusSource, number> = {
  conformance: 54,
  typecheck: 851,
  lint: 71,
  autocomplete: 43,
};

export type CorpusCheck = "incomplete" | "extent" | "syntax";

export interface KnownCorpusFailure {
  /** The input, as `corpusInputs` names it. */
  input: string;
  check: CorpusCheck;
  /** The open Bug that explains it. */
  issue: number;
  reason: string;
}

/**
 * The inputs the gate knows to fail, each with its open Bug. An entry must
 * still fail until the fix removes it. A conformance file's syntax agreement
 * is `luauSyntaxAgreement`'s, against `KNOWN_DISAGREEMENTS`.
 */
export const KNOWN_CORPUS_FAILURES: KnownCorpusFailure[] = [
  ...failing(879, "incomplete", "a call to `require` is read as a terminator keyword", [
    "typecheck/TypeInfer.annotations.test.cpp/use_type_required_from_another_file check 1",
    "typecheck/TypeInfer.annotations.test.cpp/cannot_use_nonexported_type check 1",
    "typecheck/TypeInfer.annotations.test.cpp/builtin_types_are_not_exported check 1",
    "typecheck/TypeInfer.provisional.test.cpp/generic_type_leak_to_module_interface check 2",
    "typecheck/TypeInfer.provisional.test.cpp/generic_type_leak_to_module_interface_variadic check 2",
    "typecheck/TypeInfer.provisional.test.cpp/table_unification_infinite_recursion check 2",
    "typecheck/TypeInfer.tables.test.cpp/dont_invalidate_the_properties_iterator_of_free_table_when_rolled_back check 2",
    "typecheck/TypeInfer.tables.test.cpp/instantiated_metatable_frozen_table_clone_mutation check 2",
    "typecheck/TypeInfer.test.cpp/warn_on_lowercase_parent_property",
    "typecheck/TypeInfer.test.cpp/fuzzer_has_indexer_can_create_cyclic_union",
    "typecheck/TypeInfer.test.cpp/config_reader_example check 2",
    "typecheck/TypeInfer.test.cpp/is_safe_integer_example check 3",
    "typecheck/TypeInfer.test.cpp/type_remover_heap_use_after_free check 3",
    "typecheck/TypeInfer.test.cpp/fuzzer_missing_type_pack_follow check 1",
    "typecheck/TypeInfer.test.cpp/fuzzer_missing_type_pack_follow check 2",
    "typecheck/TypeInfer.test.cpp/fuzzer_avoid_emplacing_blocked_types_you_dont_own check 1",
    "typecheck/TypeInfer.test.cpp/fuzzer_avoid_emplacing_blocked_types_you_dont_own check 2",
  ]),
  ...failing(876, "incomplete", "a variadic type `...T`, or a pack `T...` inside `<< >>`", [
    "typecheck/TypeInfer.annotations.test.cpp/unknown_generic_type_pack_in_explicit_instantiation_generates_one_error check 1",
    "typecheck/TypeInfer.annotations.test.cpp/unknown_generic_type_pack_in_explicit_instantiation_generates_one_error check 2",
    "typecheck/TypeInfer.annotations.test.cpp/unknown_generic_type_pack_in_explicit_instantiation_generates_one_error check 3",
    "typecheck/TypeInfer.anyerror.test.cpp/for_in_loop_iterator_is_any_pack",
    "typecheck/TypeInfer.tables.test.cpp/access_index_metamethod_that_returns_variadic",
    "typecheck/TypeInfer.tables.test.cpp/result_like_tagged_union",
    "typecheck/TypeInfer.test.cpp/multiple_assignment",
    "typecheck/TypeInfer.tryUnify.test.cpp/variadics_should_use_reversed_properly",
  ]),
  ...failing(922, "incomplete", "`then` right after a closing `]` or `)`", ["typecheck/TypeInfer.test.cpp/regexp_hang"]),
  ...failing(1988, "incomplete", "a `;` right after a `repeat`'s `until` condition", ["conformance/constructs.luau"]),
  ...failing(1990, "incomplete", "a one-line `return if ... else ...` before the function's `end`", [
    "conformance/coroutine.luau",
    "typecheck/TypeInfer.provisional.test.cpp/normalization_limit_in_unify_with_any",
  ]),
  ...failing(1985, "incomplete", "an unclosed `(`", ["typecheck/TypeInfer.test.cpp/visit_error_nodes_in_lvalue"]),
  ...failing(1989, "incomplete", "a keyword as a method name after `:`", ["autocomplete/autocompleteMembers.test.ts/keyword_methods"]),
  ...failing(1987, "syntax", "Luau rejects a function with no valid name; Sparkdown reports nothing", [
    "typecheck/TypeInfer.test.cpp/tc_after_error_recovery_no_assert",
    "typecheck/TypeInfer.test.cpp/tc_after_error_recovery_no_replacement_name_in_error check 4",
  ]),
  ...failing(1986, "syntax", "Luau rejects `nil` as a table key and a second table indexer; Sparkdown reports nothing", [
    "typecheck/TypeInfer.test.cpp/fuzzer_missing_follow_in_assign_index_constraint",
    "typecheck/TypeInfer.singletons.test.cpp/table_properties_alias_or_parens_is_indexer",
  ]),
  ...failing(1991, "syntax", "Sparkdown rejects a local named `var` or `temp` as a reserved keyword; Luau accepts it", [
    "typecheck/TypeInfer.singletons.test.cpp/oss_2010",
    "typecheck/TypeInfer.tables.test.cpp/indexers_get_quantified_too",
  ]),
  ...failing(1992, "syntax", "Sparkdown applies its story-wide `const` rules to a function-local `const`; Luau accepts it", [
    "typecheck/TypeInfer.const.test.cpp/const_extra_lvalues_are_nil_and_syntax_error_from_call",
    "typecheck/TypeInfer.const.test.cpp/const_shadowing",
    "typecheck/TypeInfer.tables.test.cpp/oss_2597_constraint_forcing_bad_refinement",
  ]),
];

function failing(issue: number, check: CorpusCheck, reason: string, inputs: string[]): KnownCorpusFailure[] {
  return inputs.map((input) => ({ input, check, issue, reason }));
}

// A snippet is a Luau module, whose chunk takes `...`, so `run` does too.
const HEADER = "function run()";
const VARARG_HEADER = "function run(...)";

function wrapped(name: string, source: CorpusSource, snippet: string): CorpusInput {
  const text = wrapConformanceSource(snippet).replace(HEADER, VARARG_HEADER);
  const luau = conformanceLuau(snippet).replace(HEADER, VARARG_HEADER);
  const functionEnd = text.lastIndexOf("end") + "end".length;
  return { name, source, text, luau, functionStart: text.indexOf(VARARG_HEADER), functionEnd };
}

/** Gives a name that recurs ` (2)`, ` (3)` and so on, in order. */
function namer(): (name: string) => string {
  const seen = new Map<string, number>();
  return (name) => {
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    return n === 1 ? name : `${name} (${n})`;
  };
}

function conformanceInputs(): CorpusInput[] {
  return luauInputs()
    .filter((input) => input.name.startsWith("conformance/"))
    .map((input) => ({
      name: input.name,
      source: "conformance" as const,
      text: input.text,
      luau: input.luau!,
      functionStart: input.text.indexOf(HEADER),
      functionEnd: input.text.lastIndexOf("end") + "end".length,
    }));
}

/** The type-checker ports' snippets, from the cases each port file handed to `portUpstreamFile`. */
export function typecheckInputs(ports: Map<string, PortedCase[]>): CorpusInput[] {
  const found: CorpusInput[] = [];
  for (const file of [...ports.keys()].sort()) {
    const name = namer();
    for (const c of ports.get(file)!) {
      const checks = "checks" in c && c.checks ? c.checks : [c as unknown as { source: string }];
      checks.forEach((check, i) => {
        const base = `typecheck/${file}/${c.name}${checks.length > 1 ? ` check ${i + 1}` : ""}`;
        found.push(wrapped(name(base), "typecheck", check.source));
        const modules = (check as { moduleSources?: Record<string, string> }).moduleSources ?? {};
        for (const [module, source] of Object.entries(modules)) {
          found.push(wrapped(name(`${base} module ${module}`), "typecheck", source));
        }
      });
    }
  }
  return found;
}

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
}

/** A string or substitution-free template literal's text, otherwise `undefined`. */
function literal(node: ts.Node | undefined): string | undefined {
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : undefined;
}

function calleeName(call: ts.CallExpression): string | undefined {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return undefined;
}

function forEachCall(node: ts.Node, visit: (call: ts.CallExpression) => void): void {
  if (ts.isCallExpression(node)) visit(node);
  ts.forEachChild(node, (child) => forEachCall(child, visit));
}

const LUAU_CASE = /^\/\/ Luau: (.+)$/m;

/** The linter ports' snippets: literals handed to a helper that places them in a function, in a `// Luau:` group. */
function lintInputs(): CorpusInput[] {
  const found: CorpusInput[] = [];
  const files = readdirSync(LINT_ROOT)
    .filter((f) => /^Lint.*\.test\.ts$/.test(f))
    .sort();
  for (const file of files) {
    const source = parse(join(LINT_ROOT, file));
    const name = namer();
    for (const statement of source.statements) {
      const comments = ts.getLeadingCommentRanges(source.text, statement.pos) ?? [];
      const marked = comments
        .map((range) => LUAU_CASE.exec(source.text.slice(range.pos, range.end)))
        .find((match) => match);
      if (!marked) continue;
      forEachCall(statement, (call) => {
        const snippet = literal(call.arguments[0]);
        if (snippet === undefined || !calleeName(call)?.endsWith("InFunction")) return;
        found.push(wrapped(name(`lint/${file}/${marked[1]!.trim()}`), "lint", snippet));
      });
    }
  }
  return found;
}

const CURSOR = /@\d/g;
const AUTOCOMPLETE_HELPERS = new Set(["labelsAt", "labelsTypedAt", "complete", "cursorsWithin"]);

/** The autocomplete ports' documents, from the cases ported verbatim. */
function autocompleteInputs(): CorpusInput[] {
  const found: CorpusInput[] = [];
  const files = readdirSync(AUTOCOMPLETE_ROOT)
    .filter((f) => /^autocomplete.*\.test\.ts$/.test(f))
    .sort();
  for (const file of files) {
    const source = parse(join(AUTOCOMPLETE_ROOT, file));
    const name = namer();
    forEachCall(source, (call) => {
      // `upstreamCase(name, title, body)` or `upstreamCase.bug(bug, name, title, body)`.
      const callee = call.expression;
      const bug = ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === "upstreamCase";
      if (!bug && !(ts.isIdentifier(callee) && callee.text === "upstreamCase")) return;
      const caseName = literal(call.arguments[bug ? 1 : 0]);
      if (caseName === undefined || AUTOCOMPLETE_CASES[caseName]?.status !== "ported") return;
      const body = call.arguments[call.arguments.length - 1];
      if (!body) return;
      forEachCall(body, (inner) => {
        const document = literal(inner.arguments[0]);
        if (document === undefined || !AUTOCOMPLETE_HELPERS.has(calleeName(inner) ?? "")) return;
        // The port's function, without the Sparkdown declarations around it.
        const plain = document.replace(CURSOR, "");
        const start = plain.search(/^function /m);
        const end = plain.slice(start).search(/^end\b/m);
        if (start < 0 || end < 0) return;
        const text = `${plain.slice(start, start + end + "end".length)}\n`;
        found.push({
          name: name(`autocomplete/${file}/${caseName}`),
          source: "autocomplete",
          text,
          luau: text,
          functionStart: 0,
          functionEnd: text.length - 1,
        });
      });
    });
  }
  return found;
}

/** Every input of the corpus, conformance files first, each source in name order. */
export function corpusInputs(ports: Map<string, PortedCase[]>): CorpusInput[] {
  return [...conformanceInputs(), ...typecheckInputs(ports), ...lintInputs(), ...autocompleteInputs()];
}
