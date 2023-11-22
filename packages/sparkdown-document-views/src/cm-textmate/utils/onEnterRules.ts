import { startCompletion } from "@codemirror/autocomplete";
import { getIndentUnit, indentString } from "@codemirror/language";
import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

const INDENT_REGEX = /([ \t]*)/;

export const onEnterRules =
  (
    onEnterRules?: {
      beforeText: string;
      afterText?: string;
      previousLineText?: string;
      action: {
        indent?: "none" | "indent" | "outdent" | "indentOutdent";
        appendText?: string;
        deleteText?: string;
        removeText?: number;
      };
    }[]
  ) =>
  (target: EditorView): boolean => {
    const { state, dispatch } = target;

    const { doc } = state;
    let triggeredRule = undefined;
    const changes = state.changeByRange((range) => {
      const pos = range.from;
      const beforeLine = doc.lineAt(pos);
      if (!onEnterRules || state.selection.ranges.length !== 1) {
        return { range };
      }
      const selectionFrom = state.selection.main.from;
      const selectionTo = state.selection.main.to;
      const afterTextLine = doc.lineAt(selectionTo);
      const beforeText = state.sliceDoc(beforeLine.from, selectionFrom);
      const afterText = state.sliceDoc(
        selectionTo,
        afterTextLine.from + afterTextLine.text.length
      );
      const previousLineText =
        beforeLine.number > 1 ? doc.line(beforeLine.number - 1)?.text : "";
      const currentIndentSize =
        beforeLine.text.match(INDENT_REGEX)?.[0].length ?? 0;
      const decreasedIndentSize = currentIndentSize - getIndentUnit(state);
      const increasedIndentSize = currentIndentSize + getIndentUnit(state);
      let cursorOffset = 0;
      for (let i = 0; i < onEnterRules.length; i += 1) {
        const onEnterRule = onEnterRules[i]!;
        const beforeTextRegex = onEnterRule.beforeText
          ? new RegExp(onEnterRule.beforeText)
          : undefined;
        const afterTextRegex = onEnterRule.afterText
          ? new RegExp(onEnterRule.afterText)
          : undefined;
        const previousLineTextRegex = onEnterRule.previousLineText
          ? new RegExp(onEnterRule.previousLineText)
          : undefined;
        if (beforeTextRegex && !beforeTextRegex.test(beforeText)) {
          continue;
        }
        if (afterTextRegex && !afterTextRegex.test(afterText)) {
          continue;
        }
        if (
          previousLineTextRegex &&
          !previousLineTextRegex.test(previousLineText)
        ) {
          continue;
        }
        triggeredRule = onEnterRule;
        let indent = indentString(state, currentIndentSize);
        if (onEnterRule.action.indent === "none") {
          indent = indentString(state, currentIndentSize);
        }
        if (onEnterRule.action.indent === "indent") {
          indent = indentString(state, increasedIndentSize);
        }
        if (onEnterRule.action.indent === "outdent") {
          indent = indentString(state, decreasedIndentSize);
        }
        if (onEnterRule.action.indent === "indentOutdent") {
          const afterIndent =
            state.lineBreak + indentString(state, currentIndentSize);
          indent = indentString(state, increasedIndentSize) + afterIndent;
          cursorOffset = -afterIndent.length;
        }
        if (
          onEnterRule.action.deleteText &&
          beforeText.endsWith(onEnterRule.action.deleteText) &&
          range.empty
        ) {
          return {
            range: EditorSelection.cursor(
              pos - onEnterRule.action.deleteText.length + cursorOffset
            ),
            changes: [
              {
                from: beforeLine.to - onEnterRule.action.deleteText.length,
                to: beforeLine.to,
                insert: "",
              },
            ],
          };
        } else if (onEnterRule.action.appendText && range.empty) {
          const insert =
            state.lineBreak + indent + onEnterRule.action.appendText;
          return {
            range: EditorSelection.cursor(pos + insert.length + cursorOffset),
            changes: [
              {
                from: pos,
                to: pos,
                insert,
              },
            ],
          };
        } else {
          const preChanges = [];
          if (!range.empty) {
            preChanges.push({
              from: range.from,
              to: range.to,
              insert: "",
            });
          }
          const insert = state.lineBreak + indent;
          return {
            range: EditorSelection.cursor(pos + insert.length + cursorOffset),
            changes: [
              ...preChanges,
              {
                from: pos,
                to: pos,
                insert,
              },
            ],
          };
        }
      }
      return { range };
    });

    if (triggeredRule) {
      dispatch(
        state.update(changes, { scrollIntoView: true, userEvent: "input" })
      );
      return startCompletion(target);
    }

    const defaultChanges = state.changeByRange((range) => {
      const pos = range.from;
      const insert = state.lineBreak;
      return {
        range: EditorSelection.cursor(pos + insert.length),
        changes: [
          {
            from: pos,
            to: pos,
            insert,
          },
        ],
      };
    });
    dispatch(
      state.update(defaultChanges, { scrollIntoView: true, userEvent: "input" })
    );
    return startCompletion(target);
  };
