import { getIndentUnit, indentString } from "@codemirror/language";
import { EditorSelection, Facet, Prec, combineConfig } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";

const INDENT_REGEX = /([ \t]*)/;

export interface VSCodeOnEnterRulesConfig<T = string> {
  onEnterRules?: {
    beforeText: T;
    afterText?: T;
    previousLineText?: T;
    action: {
      indent: string;
      appendText?: string;
      deleteText?: string;
      removeText?: number;
    };
  }[];
}

export const vscodeOnEnterRulesConfig = Facet.define<
  VSCodeOnEnterRulesConfig<RegExp>,
  Required<VSCodeOnEnterRulesConfig<RegExp>>
>({
  combine(configs) {
    return combineConfig(configs, {});
  },
});

export function onEnterRulesCommand(view: EditorView) {
  const state = view.state;
  const config = state.facet(vscodeOnEnterRulesConfig);
  const onEnterRules = config.onEnterRules;
  const doc = state.doc;

  let triggeredRule = undefined;

  const modifiedTransactionSpec = state.changeByRange((range) => {
    const pos = range.from;
    const beforeLine = doc.lineAt(pos);

    if (!onEnterRules || state.selection.ranges.length !== 1) {
      return { range };
    }

    const selectionFrom = state.selection.main.from;
    const selectionTo = state.selection.main.to;
    const cursorFromLine = doc.lineAt(selectionFrom);
    const cursorToLine = doc.lineAt(selectionTo);

    const lineTextBeforeCursor = state.sliceDoc(
      cursorFromLine.from,
      selectionFrom,
    );
    const lineTextAfterCursor = state.sliceDoc(
      selectionTo,
      cursorToLine.from + cursorToLine.text.length,
    );
    const previousLineText =
      beforeLine.number > 1 ? doc.line(beforeLine.number - 1)?.text : "";

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

      // 1. Calculate the base indentation for the NEW line
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

      // 2. Handle 'indentOutdent' which adds an extra line below the cursor
      if (onEnterRule.action.indent === "indentOutdent") {
        afterIndent = state.lineBreak + indentString(state, currentIndentSize);
      }

      // 3. Handle 'removeText' (removes N characters from the new line's indentation)
      if (onEnterRule.action.removeText) {
        newIndent = newIndent.slice(
          0,
          Math.max(0, newIndent.length - onEnterRule.action.removeText),
        );
      }

      // 4. Handle 'appendText'
      const append = onEnterRule.action.appendText || "";

      // Assemble the final string to insert
      const insert = state.lineBreak + newIndent + append + afterIndent;

      // 5. Calculate where the replacement starts and ends (handling 'deleteText')
      let deleteFrom = pos;
      let deleteTo = pos;

      if (!range.empty) {
        deleteFrom = range.from;
        deleteTo = range.to;
      } else if (
        onEnterRule.action.deleteText &&
        lineTextBeforeCursor.endsWith(onEnterRule.action.deleteText)
      ) {
        deleteFrom = pos - onEnterRule.action.deleteText.length;
      }

      // 6. Calculate exactly where the cursor should land
      // It should be right after the appended text, before any 'afterIndent'
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
  config: VSCodeOnEnterRulesConfig<string | RegExp> = {},
) => {
  const regexConfig = structuredClone(config);
  if (regexConfig.onEnterRules) {
    for (const onEnterRule of regexConfig.onEnterRules) {
      if (typeof onEnterRule.beforeText === "string") {
        onEnterRule.beforeText = new RegExp(onEnterRule.beforeText, "u");
      }
      if (typeof onEnterRule.afterText === "string") {
        onEnterRule.afterText = new RegExp(onEnterRule.afterText, "u");
      }
      if (typeof onEnterRule.previousLineText === "string") {
        onEnterRule.previousLineText = new RegExp(
          onEnterRule.previousLineText,
          "u",
        );
      }
    }
  }
  return [
    vscodeOnEnterRulesConfig.of(
      regexConfig as VSCodeOnEnterRulesConfig<RegExp>,
    ),
    Prec.high(
      keymap.of([
        {
          key: "Enter",
          run: onEnterRulesCommand,
        },
      ]),
    ),
  ];
};
