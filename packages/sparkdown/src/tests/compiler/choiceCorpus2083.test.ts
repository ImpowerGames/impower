import { describe, expect, test } from "vitest";
import CORPUS from "./fixtures/choice-corpus-2083.json";
import { testCompiler, testStory } from "../engineUnderTest";
import { compareEngines, vscodeScopeStacksPerChar } from "./scopeEquality";

interface Run {
  out: string;
  errs: string[];
}

interface Reading {
  first: string;
  choices: string[];
  runs: Run[];
  rt: string[];
  diags: string[];
  scopes: string;
}

interface CorpusCase extends Reading {
  id: string;
  source: string;
  class?: "A" | "B" | "C" | "D";
}

const CASES = (CORPUS as { cases: CorpusCase[] }).cases;

const fnv = (text: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
};

const compile = (text: string) => {
  const compiler = testCompiler();
  compiler.configure({
    files: [
      {
        uri: "inmemory:///main.sd",
        type: "script",
        name: "main",
        ext: "sd",
        text,
        version: 1,
        languageId: "sparkdown",
      } as any,
    ],
  });
  const result = compiler.compile({ textDocument: { uri: "inmemory:///main.sd" } });
  const diags: string[] = [];
  for (const ds of Object.values(result.program.diagnostics ?? {})) {
    for (const d of ds as any[]) {
      const message = typeof d.message === "string" ? d.message : JSON.stringify(d.message);
      diags.push(
        `${d.severity}@${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character} ${message}`,
      );
    }
  }
  diags.sort();
  return { result, diags };
};

const play = (result: any) => {
  const runs: Run[] = [];
  let choices: string[] = [];
  let first = "";
  const rt: string[] = [];
  try {
    const story = testStory(result.program.chunks);
    story.onError = (m: string) => rt.push(m);
    const beats: string[] = [];
    let guard = 0;
    while (story.canContinue && guard++ < 200) beats.push(story.Continue() ?? "");
    first = beats.join("|BEAT|");
    choices = story.currentChoices.map((c: any) => c.text);
  } catch (e: any) {
    rt.push("THROW " + String(e?.message ?? e).slice(0, 200));
  }
  for (let i = 0; i < choices.length; i++) {
    const errs: string[] = [];
    let out = "";
    try {
      const story = testStory(result.program.chunks);
      story.onError = (m: string) => errs.push(m);
      story.ContinueMaximally();
      story.ChooseChoiceIndex(i);
      out = story.ContinueMaximally();
      const next = story.currentChoices.map((c: any) => c.text);
      if (next.length) out += " ||NEXT " + JSON.stringify(next);
    } catch (e: any) {
      errs.push("THROW " + String(e?.message ?? e).slice(0, 200));
    }
    runs.push({ out, errs });
  }
  return { first, choices, runs, rt };
};

const readingOf = async (source: string): Promise<Reading> => {
  const { result, diags } = compile(source);
  const perChar = await vscodeScopeStacksPerChar(source);
  const scopes = [...source].map((ch, i) => (ch === "\n" ? "\\n" : perChar[i]!.join(" ")));
  return { ...play(result), diags, scopes: fnv(scopes.join("|")) };
};

const recorded = ({ first, choices, runs, rt, diags, scopes }: Reading): Reading => ({
  first,
  choices,
  runs,
  rt,
  diags,
  scopes,
});

describe("choice, divert and chain lines without a comment read as recorded", () => {
  test("the corpus holds every stated difference from main", () => {
    const classes = new Set(CASES.flatMap((c) => (c.class ? [c.class] : [])));
    expect([...classes].sort()).toEqual(["A", "B", "C", "D"]);
  });

  test("styled spans and glue around an interpolation read as a unit are recorded with main's colours", () => {
    const line = (c: CorpusCase) => c.source.split("\n")[4]!;
    const unclassed = CASES.filter((c) => !c.class).map(line);
    expect(unclassed.filter((l) => /\*far \{#\{\{\{\{1\}\}\}\}\} away\*/.test(l)).length).toBeGreaterThan(5);
    expect(unclassed.filter((l) => /\.\. \{#\{\{\{\{1\}\}\}\}\}/.test(l)).length).toBeGreaterThan(5);
  });

  const CHUNK = 25;
  const chunks = Array.from({ length: Math.ceil(CASES.length / CHUNK) }, (_, i) =>
    CASES.slice(i * CHUNK, (i + 1) * CHUNK),
  );

  test.each(chunks.map((chunk) => [`${chunk[0]!.id} to ${chunk.at(-1)!.id}`, chunk] as const))(
    "%s",
    async (_name, chunk) => {
      const mismatches: { id: string; class?: string; expected: unknown; received: unknown }[] = [];
      for (const entry of chunk) {
        await new Promise((resolve) => setImmediate(resolve));
        const received = await readingOf(entry.source);
        const divergences = await compareEngines(entry.source);
        if (JSON.stringify(received) !== JSON.stringify(recorded(entry)) || divergences.length > 0) {
          mismatches.push({ id: entry.id, class: entry.class, expected: recorded(entry), received: { ...received, divergences } });
        }
      }
      expect(mismatches).toEqual([]);
    },
    120000,
  );
});
