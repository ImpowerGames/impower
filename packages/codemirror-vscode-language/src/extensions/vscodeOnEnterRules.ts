import { getIndentUnit, indentString } from "@codemirror/language";
import { EditorSelection, Facet, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { type LanguageReader } from "@impower/textmate-grammar-tree/src/tree/utils/createLanguageReader";

import { VSCodeConfigDefinition } from "../types/VSCodeConfigDefinition";
import { languageRunAt } from "../utils/languageAt";

const INDENT_REGEX = /([ \t]*)/;

interface OnEnterRule {
  beforeText: RegExp;
  afterText?: RegExp;
  previousLineText?: RegExp;
  action: {
    indent: string;
    appendText?: string;
    deleteText?: string;
    removeText?: number;
  };
}

interface OnEnterRulesByLanguage {
  reader: LanguageReader;
  documentLanguage: string;
  rulesByLanguage: ReadonlyMap<string, readonly OnEnterRule[]>;
}

const vscodeOnEnterRulesConfig = Facet.define<
  OnEnterRulesByLanguage,
  OnEnterRulesByLanguage | undefined
>({
  combine: (values) => values.at(-1),
});

const compileRules = (
  config: VSCodeConfigDefinition | undefined,
): OnEnterRule[] =>
  (config?.onEnterRules ?? []).map(
    ({ beforeText, afterText, previousLineText, action }) => ({
      beforeText: new RegExp(beforeText, "u"),
      ...(afterText !== undefined
        ? { afterText: new RegExp(afterText, "u") }
        : {}),
      ...(previousLineText !== undefined
        ? { previousLineText: new RegExp(previousLineText, "u") }
        : {}),
      action: { ...action },
    }),
  );

export function onEnterRulesCommand(view: EditorView) {
  const state = view.state;
  const config = state.facet(vscodeOnEnterRulesConfig);
  const doc = state.doc;

  let triggeredRule = undefined;

  const modifiedTransactionSpec = state.changeByRange((range) => {
    const pos = range.from;
    const beforeLine = doc.lineAt(pos);

    if (!config || state.selection.ranges.length !== 1) {
      return { range };
    }

    const { reader, documentLanguage, rulesByLanguage } = config;
    const selectionFrom = state.selection.main.from;
    const selectionTo = state.selection.main.to;
    const fromRun = languageRunAt(reader, state, selectionFrom, documentLanguage);
    const toRun = languageRunAt(reader, state, selectionTo, documentLanguage);
    const onEnterRules =
      rulesByLanguage.get(fromRun.language) ??
      rulesByLanguage.get(documentLanguage);

    if (!onEnterRules) {
      return { range };
    }

    const lineTextBeforeCursor = state.sliceDoc(
      fromRun.differsFromLineStart
        ? fromRun.from
        : doc.lineAt(selectionFrom).from,
      selectionFrom,
    );
    const lineTextAfterCursor = state.sliceDoc(
      selectionTo,
      Math.max(selectionTo, toRun.to),
    );
    let previousLineText = "";
    if (fromRun.startsLine && beforeLine.number > 1) {
      const previousLine = doc.line(beforeLine.number - 1);
      const previousRun = languageRunAt(
        reader,
        state,
        previousLine.to,
        documentLanguage,
      );
      if (previousRun.language === fromRun.language) {
        previousLineText = state.sliceDoc(previousRun.from, previousRun.to);
      }
    }

    const currentIndentSize =
      beforeLine.text.match(INDENT_REGEX)?.[0].length ?? 0;
    const decreasedIndentSize = currentIndentSize - getIndentUnit(state);
    const increasedIndentSize = currentIndentSize + getIndentUnit(state);

    for (const onEnterRule of onEnterRules) {
      if (
        onEnterRule.beforeText &&
        !onEnterRule.beforeText.test(lineTextBeforeCursor)
      ) {
        continue;
      }
      if (
        onEnterRule.afterText &&
        !onEnterRule.afterText.test(lineTextAfterCursor)
      ) {
        continue;
      }
      if (
        onEnterRule.previousLineText &&
        !onEnterRule.previousLineText.test(previousLineText)
      ) {
        continue;
      }

      triggeredRule = onEnterRule;

      let newIndentSize = currentIndentSize;
      if (
        onEnterRule.action.indent === "indent" ||
        onEnterRule.action.indent === "indentOutdent"
      ) {
        newIndentSize = increasedIndentSize;
      } else if (onEnterRule.action.indent === "outdent") {
        newIndentSize = decreasedIndentSize;
      }

      let newIndent = indentString(state, Math.max(0, newIndentSize));
      let afterIndent = "";

      if (onEnterRule.action.indent === "indentOutdent") {
        afterIndent = state.lineBreak + indentString(state, currentIndentSize);
      }

      if (onEnterRule.action.removeText) {
        newIndent = newIndent.slice(
          0,
          Math.max(0, newIndent.length - onEnterRule.action.removeText),
        );
      }

      const append = onEnterRule.action.appendText || "";

      const insert = state.lineBreak + newIndent + append + afterIndent;

      let deleteFrom = pos;
      let deleteTo = pos;

      if (!range.empty) {
        deleteFrom = range.from;
        deleteTo = range.to;
      } else if (onEnterRule.action.indent === "indentOutdent") {
        if (lineTextBeforeCursor.trim()) {
          deleteFrom =
            pos - (lineTextBeforeCursor.length - lineTextBeforeCursor.trimEnd().length);
        }
        deleteTo =
          pos + (lineTextAfterCursor.length - lineTextAfterCursor.trimStart().length);
      } else if (
        onEnterRule.action.deleteText &&
        lineTextBeforeCursor.endsWith(onEnterRule.action.deleteText)
      ) {
        deleteFrom = pos - onEnterRule.action.deleteText.length;
      }

      const newCursorPos =
        deleteFrom + state.lineBreak.length + newIndent.length + append.length;

      return {
        range: EditorSelection.cursor(newCursorPos),
        changes: [
          {
            from: deleteFrom,
            to: deleteTo,
            insert,
          },
        ],
      };
    }

    return { range };
  });

  if (triggeredRule) {
    view.dispatch(
      state.update(modifiedTransactionSpec, { userEvent: "input.type" }),
    );
    return true;
  }

  return false;
}

export const vscodeOnEnterRules = (
  reader: LanguageReader,
  documentLanguage: string,
  configs: Readonly<Record<string, VSCodeConfigDefinition>>,
): Extension =>
  vscodeOnEnterRulesConfig.of({
    reader,
    documentLanguage,
    rulesByLanguage: new Map(
      Object.entries(configs).map(([language, config]) => [
        language,
        compileRules(config),
      ]),
    ),
  });
