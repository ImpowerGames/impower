import { indentOnInput, indentService } from "@codemirror/language";
import { EditorState, type Extension } from "@codemirror/state";
import { type LanguageReader } from "@impower/textmate-grammar-tree/src/tree/utils/createLanguageReader";

import { VSCodeConfigDefinition } from "../types/VSCodeConfigDefinition";
import { languageAt, languageRunAt } from "../utils/languageAt";

const INDENT_REGEX = /([ \t]*)/;

const NEVER = /(?!)/;

interface IndentationPatterns {
  increase?: RegExp;
  decrease?: RegExp;
}

const patternsOf = (
  config: VSCodeConfigDefinition | undefined,
): IndentationPatterns => {
  const rules = config?.indentationRules;
  return {
    ...(rules?.increaseIndentPattern
      ? { increase: new RegExp(rules.increaseIndentPattern) }
      : {}),
    ...(rules?.decreaseIndentPattern
      ? { decrease: new RegExp(rules.decreaseIndentPattern) }
      : {}),
  };
};

export const vscodeIndentationRules = (
  reader: LanguageReader,
  documentLanguage: string,
  configs: Readonly<Record<string, VSCodeConfigDefinition>>,
): Extension => {
  const patternsByLanguage = new Map(
    Object.entries(configs).map(([language, config]) => [
      language,
      patternsOf(config),
    ]),
  );
  const patternsFor = (language: string): IndentationPatterns =>
    patternsByLanguage.get(language) ??
    patternsByLanguage.get(documentLanguage) ??
    {};

  const service = indentService.of((context, pos) => {
    const state = context.state;
    const run = languageRunAt(reader, state, pos, documentLanguage);
    const { increase, decrease } = patternsFor(run.language);

    const currentLine = state.doc.lineAt(pos);
    const lineTextBeforeCursor = state.sliceDoc(
      run.differsFromLineStart ? run.from : currentLine.from,
      pos,
    );
    const lineTextAfterCursor = state.sliceDoc(pos, Math.max(pos, run.to));

    const prevIndentSize =
      currentLine.text.match(INDENT_REGEX)?.[0].length ?? 0;

    let newIndentSize = prevIndentSize;

    const isIncrease = increase?.test(lineTextBeforeCursor) ?? false;
    if (isIncrease) {
      newIndentSize += context.unit;
    }

    const isDecrease = decrease?.test(lineTextAfterCursor) ?? false;
    if (isDecrease) {
      newIndentSize -= context.unit;
    }

    if (isIncrease || isDecrease) {
      return Math.max(0, newIndentSize);
    }

    return null;
  });

  return [
    EditorState.languageData.of((state, pos) => [
      {
        get indentOnInput() {
          return (
            patternsFor(languageAt(reader, state, pos, documentLanguage))
              .decrease ?? NEVER
          );
        },
      },
    ]),
    service,
    indentOnInput(),
  ];
};
