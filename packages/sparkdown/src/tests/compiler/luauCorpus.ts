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
// - `lint/<file>/<case>`: the snippets the ports of Luau's linter tests
//   (`../luau-conformance/Lint*.test.ts`) hand to their harness in the groups
//   marked `// Luau: <case>`. Groups marked as Sparkdown's own are left out.
// - `autocomplete/<file>/<case>`: the documents the language server's
//   autocomplete ports hand to their harness in the cases ported verbatim
//   (`ported` in `autocompleteUpstreamCases.ts`), with the `@N` cursor
//   markers removed.
//   `luauPortCapture.ts` runs those port files to read them, and reports a
//   call it could not reach.
//
// A port's whole document gets its `store` lines back as the upstream
// `local`s they stand for. Each snippet once per case, in any form, is placed
// in a function as the conformance harness places a fixture
// (`wrapConformanceSource`), with the same Luau handed to the official parser
// (`conformanceLuau`). The conformance files keep the harness's
// `function run()`. Every other snippet is a module, whose chunk takes `...`,
// so its function is `function run(...)`.

import { wrapConformanceSource } from "../luau-conformance/conformanceTestHarness";
import type { PortedCase } from "../luau-conformance/typecheck/portedCases";
import { conformanceLuau, luauInputs } from "./luauFixtures";
import type { CapturedSnippet } from "./luauPortCapture";

export type CorpusSource = "conformance" | "typecheck" | "lint" | "autocomplete";

export interface CorpusInput {
  /** `<source>/<file>/<case>`, with ` (N)` when a name recurs. */
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
  /** Where the snippet starts in `text`, and in `luau`; it is the same text in both. */
  snippetStart: number;
  luauSnippetStart: number;
}

/**
 * How many inputs each source yields. A port that loses snippets, or a
 * re-vendor that drops files, changes a count, and the gate fails until the
 * count here is changed with it.
 */
export const CORPUS_INVENTORY: Record<CorpusSource, number> = {
  conformance: 54,
  typecheck: 851,
  lint: 89,
  autocomplete: 77,
};

export type CorpusCheck = "incomplete" | "extent" | "syntax";

export interface KnownCorpusFailure {
  /** The input, as `corpusInputs` names it. */
  input: string;
  check: CorpusCheck;
  /** The open Bug that explains it. */
  issue?: number;
  /** Or the section of `docs/runtime/DIVERGENCES.md` that documents it. */
  divergence?: string;
  reason: string;
}

/**
 * The inputs the gate knows to fail, each with its open Bug or documented
 * divergence. An entry must still fail until the fix removes it. A
 * conformance file's syntax agreement is `luauSyntaxAgreement`'s, against
 * `KNOWN_DISAGREEMENTS`.
 */
export const KNOWN_CORPUS_FAILURES: KnownCorpusFailure[] = [
  ...failing(1987, "syntax", "Luau rejects a function with no valid name; Sparkdown reports nothing", [
    "typecheck/TypeInfer.test.cpp/tc_after_error_recovery_no_assert",
    "typecheck/TypeInfer.test.cpp/tc_after_error_recovery_no_replacement_name_in_error check 4",
  ]),
  ...failing(1986, "syntax", "Luau rejects `nil` as a table key and a second table indexer; Sparkdown reports nothing", [
    "typecheck/TypeInfer.test.cpp/fuzzer_missing_follow_in_assign_index_constraint",
    "typecheck/TypeInfer.singletons.test.cpp/table_properties_alias_or_parens_is_indexer",
  ]),
];

function failing(issue: number, check: CorpusCheck, reason: string, inputs: string[]): KnownCorpusFailure[] {
  return inputs.map((input) => ({ input, check, issue, reason }));
}

// A snippet is a Luau module, whose chunk takes `...`, so `run` does too.
const HEADER = "function run()";
const VARARG_HEADER = "function run(...)";

/**
 * A snippet in its function, for Sparkdown and for Luau. The document has a
 * line before and after the snippet that the Luau does not
 * (`wrapConformanceSource`, `conformanceLuau`), so the snippet's start is
 * kept for each.
 */
function placed(name: string, source: CorpusSource, snippet: string, header: string): CorpusInput {
  const text = wrapConformanceSource(snippet).replace(HEADER, header);
  const luau = conformanceLuau(snippet).replace(HEADER, header);
  const functionStart = text.indexOf(header);
  const snippetStart = text.indexOf(`${header}\n\n`) + header.length + 2;
  const luauSnippetStart = header.length + 1;
  if (text.slice(snippetStart, snippetStart + snippet.length) !== snippet || luau.slice(luauSnippetStart, luauSnippetStart + snippet.length) !== snippet) {
    throw new Error(`${name}: the wrapper no longer places the snippet where the corpus expects`);
  }
  const functionEnd = text.lastIndexOf("end") + "end".length;
  return { name, source, text, luau, functionStart, functionEnd, snippetStart, luauSnippetStart };
}

/** A module's snippet in `function run(...)`, as the corpus places it. */
export function placeSnippet(name: string, source: CorpusSource, snippet: string): CorpusInput {
  return placed(name, source, snippet, VARARG_HEADER);
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
    .map((input) => {
      // `luauInputs` gives the file as patched in `luau`, between its header and closing lines.
      const snippet = input.luau!.slice(HEADER.length + 1, -"\nend\n".length);
      const placedInput = placed(input.name, "conformance", snippet, HEADER);
      if (placedInput.text !== input.text || placedInput.luau !== input.luau) {
        throw new Error(`${input.name}: luauInputs no longer wraps a conformance file as the corpus does`);
      }
      return placedInput;
    });
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
        found.push(placeSnippet(name(base), "typecheck", check.source));
        const modules = (check as { moduleSources?: Record<string, string> }).moduleSources ?? {};
        for (const [module, source] of Object.entries(modules)) {
          found.push(placeSnippet(name(`${base} module ${module}`), "typecheck", source));
        }
      });
    }
  }
  return found;
}

const CURSOR = /@\d/g;
// A port writes an upstream top-level `local` that the rest of the snippet
// reads as a global as a `store` (autocompleteScope.test.ts). The same length
// keeps every line and column.
const STORE = /^store /gm;

/** The linter and autocomplete ports' snippets, each text once per case, in capture order. */
export function portInputs(snippets: CapturedSnippet[]): CorpusInput[] {
  const found: CorpusInput[] = [];
  const seen = new Set<string>();
  const names = new Map<string, (name: string) => string>();
  for (const snippet of snippets) {
    const plain = snippet.source === "autocomplete" ? snippet.text.replace(CURSOR, "") : snippet.text;
    const text = snippet.kind === "document" ? plain.replace(STORE, "local ") : plain;
    const key = `${snippet.source}/${snippet.file}/${snippet.scope}`;
    if (seen.has(`${key}\n${text}`)) continue;
    seen.add(`${key}\n${text}`);
    if (!names.has(snippet.file)) names.set(snippet.file, namer());
    found.push(placeSnippet(names.get(snippet.file)!(key), snippet.source, text));
  }
  return found;
}

/** Every input of the corpus: the conformance files, then the type-checker, linter and autocomplete ports. */
export function corpusInputs(ports: Map<string, PortedCase[]>, snippets: CapturedSnippet[]): CorpusInput[] {
  return [...conformanceInputs(), ...typecheckInputs(ports), ...portInputs(snippets)];
}
