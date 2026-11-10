import {
  type Completion,
  type CompletionContext,
  type CompletionResult,
  snippet,
} from "@codemirror/autocomplete";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import {
  EditorState,
  type Extension,
  Text,
  type Transaction,
  type TransactionSpec,
} from "@codemirror/state";
import { type EditorView } from "@codemirror/view";
import { type LanguageReader } from "@impower/textmate-grammar-tree/src/tree/utils/createLanguageReader";

import {
  type VSCodeSnippetDefinition,
  type VSCodeSnippetsDefinition,
} from "../types/VSCodeSnippetDefinition";
import { convertSnippetToTemplate } from "../utils/convertSnippetToTemplate";

const PARSE_TIMEOUT_MS = 100;

interface SnippetEntry {
  prefix: string;
  body: string | string[];
  description?: string;
  name: string;
}

const isBody = (value: unknown): value is string | string[] =>
  typeof value === "string" ||
  (Array.isArray(value) && value.every((line) => typeof line === "string"));

const snippetEntriesOf = (
  snippets: VSCodeSnippetsDefinition | undefined,
): SnippetEntry[] => {
  const entries: SnippetEntry[] = [];
  for (const [name, value] of Object.entries(snippets ?? {})) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const { prefix, body, description } =
      value as Partial<VSCodeSnippetDefinition>;
    if (!isBody(body)) continue;
    const prefixes = typeof prefix === "string" ? [prefix] : (prefix ?? []);
    for (const p of prefixes) {
      if (typeof p !== "string" || !p) continue;
      entries.push({
        prefix: p,
        body,
        name,
        ...(typeof description === "string" ? { description } : {}),
      });
    }
  }
  return entries;
};

const applySnippet =
  (entry: SnippetEntry) =>
  (view: EditorView, completion: Completion, from: number, to: number) => {
    const selection = view.state.selection.main;
    const selectedText = view.state.sliceDoc(selection.from, selection.to);
    const { template, standIns } = convertSnippetToTemplate(entry.body, {
      TM_SELECTED_TEXT: selectedText,
      SELECTION: selectedText,
    });
    const restore = (text: string) =>
      [...text].map((c) => standIns.get(c) ?? c).join("");
    const state = view.state;
    const editor = {
      state: new Proxy(state, {
        get(target, property) {
          if (property === "update") {
            return (...specs: TransactionSpec[]) =>
              target.update(
                ...specs.map((spec) => {
                  const changes = spec.changes as
                    { from: number; to?: number; insert?: Text } | undefined;
                  if (!changes?.insert) return spec;
                  return {
                    ...spec,
                    changes: {
                      ...changes,
                      insert: Text.of(
                        restore(changes.insert.toString()).split("\n"),
                      ),
                    },
                  };
                }),
              );
          }
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }),
      dispatch: (tr: Transaction) => view.dispatch(tr),
    };
    snippet(template)(
      editor,
      completion,
      Math.min(from, selection.from),
      Math.max(to, selection.to),
    );
  };

const completionsOf = (entries: readonly SnippetEntry[]): Completion[] =>
  entries.map((entry) => ({
    label: entry.prefix,
    displayLabel: entry.prefix,
    detail: entry.description ?? entry.name,
    type: "snippet",
    apply: applySnippet(entry),
  }));

const typedPrefixStart = (
  before: string,
  entries: readonly SnippetEntry[],
): number => {
  const run = /\S*$/.exec(before)![0];
  for (let i = 0; i < run.length; i++) {
    const typed = run.slice(i).toLowerCase();
    if (entries.some((e) => e.prefix.toLowerCase().startsWith(typed))) {
      return before.length - run.length + i;
    }
  }
  return before.length;
};

export const vscodeSnippets = (
  reader: LanguageReader,
  documentLanguage: string,
  snippetsByLanguage: Readonly<Record<string, VSCodeSnippetsDefinition>>,
): Extension => {
  const entriesByLanguage = new Map<string, SnippetEntry[]>(
    Object.entries(snippetsByLanguage).map(([language, snippets]) => [
      language,
      snippetEntriesOf(snippets),
    ]),
  );
  const completionsByLanguage = new Map<string, Completion[]>(
    [...entriesByLanguage].map(([language, entries]) => [
      language,
      completionsOf(entries),
    ]),
  );
  const source = (context: CompletionContext): CompletionResult | null => {
    const { state, pos } = context;
    const line = state.doc.lineAt(pos);
    const tree =
      ensureSyntaxTree(state, line.to, PARSE_TIMEOUT_MS) ?? syntaxTree(state);
    const cursorLanguage = reader.cursor(
      tree,
      state.doc,
      pos,
      documentLanguage,
    );
    const language = entriesByLanguage.has(cursorLanguage)
      ? cursorLanguage
      : documentLanguage;
    const entries = entriesByLanguage.get(language) ?? [];
    if (entries.length === 0) return null;
    const before = state.sliceDoc(line.from, pos);
    const from = line.from + typedPrefixStart(before, entries);
    if (from === pos && !context.explicit) return null;
    return {
      from,
      options: completionsByLanguage.get(language) ?? [],
    };
  };
  return EditorState.languageData.of(() => [{ autocomplete: source }]);
};
