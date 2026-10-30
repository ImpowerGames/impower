import { wrapConformanceSource } from "../luau-conformance/conformanceTestHarness";
import type { PortedCase } from "../luau-conformance/typecheck/portedCases";
import { conformanceLuau, luauInputs } from "./luauFixtures";
import type { CapturedSnippet } from "./luauPortCapture";

export type CorpusSource = "conformance" | "typecheck" | "lint" | "autocomplete";

export interface CorpusInput {
  name: string;
  source: CorpusSource;
  text: string;
  luau: string;
  functionStart: number;
  functionEnd: number;
  snippetStart: number;
  luauSnippetStart: number;
}

export const CORPUS_INVENTORY: Record<CorpusSource, number> = {
  conformance: 54,
  typecheck: 851,
  lint: 89,
  autocomplete: 77,
};

export type CorpusCheck = "incomplete" | "extent" | "syntax";

export interface KnownCorpusFailure {
  input: string;
  check: CorpusCheck;
  issue?: number;
  divergence?: string;
  reason: string;
}

export const KNOWN_CORPUS_FAILURES: KnownCorpusFailure[] = [];

const HEADER = "function run()";
const VARARG_HEADER = "function run(...)";

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

export function placeSnippet(name: string, source: CorpusSource, snippet: string): CorpusInput {
  return placed(name, source, snippet, VARARG_HEADER);
}

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
      const snippet = input.luau!.slice(HEADER.length + 1, -"\nend\n".length);
      const placedInput = placed(input.name, "conformance", snippet, HEADER);
      if (placedInput.text !== input.text || placedInput.luau !== input.luau) {
        throw new Error(`${input.name}: luauInputs no longer wraps a conformance file as the corpus does`);
      }
      return placedInput;
    });
}

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
const STORE = /^store /gm;

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

export function corpusInputs(ports: Map<string, PortedCase[]>, snippets: CapturedSnippet[]): CorpusInput[] {
  return [...conformanceInputs(), ...typecheckInputs(ports), ...portInputs(snippets)];
}
