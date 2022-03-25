/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable no-cond-assign */
/* eslint-disable no-return-assign */
import { EditorState } from "@codemirror/basic-setup";
import { syntaxTree } from "@codemirror/language";
import {
  ChangeSpec,
  EditorSelection,
  SelectionRange,
  StateCommand,
  Text,
} from "@codemirror/state";
import { Line } from "@codemirror/text";
import { SyntaxNode, Tree } from "@lezer/common";
import { sparkRegexes } from "../../impower-script-parser";
import { Context } from "../classes/Context";
import { itemNumber } from "../utils/itemNumber";
import { sparkLanguage } from "../utils/sparkLanguage";

const START_REGEX = /^[\s\d.)\-+*>]*/;

function nodeStart(node: SyntaxNode, doc: Text) {
  return doc.sliceString(node.from, node.from + 50);
}

function getContext(node: SyntaxNode, line: string, doc: Text): Context[] {
  const nodes = [];
  for (
    let cur: SyntaxNode | null = node;
    cur && cur.name !== "Document";
    cur = cur.parent
  ) {
    if (cur.name === "ListItem") {
      nodes.push(cur);
    }
  }
  const context: Context[] = [];
  let pos = 0;
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    const node = nodes[i];
    let match;
    const start = pos;
    if (
      node.name === "ListItem" &&
      node.parent?.name === "OrderedList" &&
      (match = /^([ \t]*)\d+([.)])([ \t]*)/.exec(nodeStart(node, doc)))
    ) {
      let after = match[3];
      let len = match[0].length;
      if (after.length >= 4) {
        after = after.slice(0, after.length - 4);
        len -= 4;
      }
      pos += len;
      context.push(
        new Context(node.parent, start, pos, match[1], after, match[2], node)
      );
    }
  }
  return context;
}

function renumberList(
  after: SyntaxNode,
  doc: Text,
  changes: ChangeSpec[],
  offset = 0
) {
  for (let prev = -1, node = after; ; ) {
    if (node.name === "ListItem") {
      const m = itemNumber(node, doc);
      const number = +m[2];
      if (prev >= 0) {
        if (number !== prev + 1) return;
        changes.push({
          from: node.from + m[1].length,
          to: node.from + m[0].length,
          insert: String(prev + 2 + offset),
        });
      }
      prev = number;
    }
    const next = node.nextSibling;
    if (!next) break;
    node = next;
  }
}

/// This command, when invoked in Markdown context with cursor
/// selection(s), will create a new line with the markup for
/// blockquotes and lists that were active on the old line. If the
/// cursor was directly after the end of the markup for the old line,
/// trailing whitespace and list markers are removed from that line.
///
/// The command does nothing in non-Markdown context, so it should
/// not be used as the only binding for Enter (even in a Markdown
/// document, HTML and code regions might use a different language).
export const insertNewlineContinueMarkup: StateCommand = ({
  state,
  dispatch,
}) => {
  const tree = syntaxTree(state);
  const { doc } = state;
  let dont = null;
  const changes = state.changeByRange((range) => {
    if (!range.empty || !sparkLanguage.isActiveAt(state, range.from))
      return (dont = { range });
    const pos = range.from;
    const line = doc.lineAt(pos);
    const context = getContext(tree.resolveInner(pos, -1), line.text, doc);
    while (context.length && context[context.length - 1].from > pos - line.from)
      context.pop();
    if (!context.length) return (dont = { range });
    const inner = context[context.length - 1];
    if (inner.to - inner.spaceAfter.length > pos - line.from)
      return (dont = { range });

    const emptyLine =
      pos >= inner.to - inner.spaceAfter.length &&
      !/\S/.test(line.text.slice(inner.to));
    // Empty line in list
    if (inner.item && emptyLine) {
      // First list item or blank line before: delete a level of markup
      if (
        inner.node.firstChild?.to >= pos ||
        (line.from > 0 && !/[^\s>]/.test(doc.lineAt(line.from - 1).text))
      ) {
        const next = context.length > 1 ? context[context.length - 2] : null;
        let delTo;
        let insert = "";
        if (next && next.item) {
          // Re-add marker for the list at the next level
          delTo = line.from + next.from;
          insert = next.marker(doc, 1);
        } else {
          delTo = line.from + (next ? next.to : 0);
        }
        const changes: ChangeSpec[] = [{ from: delTo, to: pos, insert }];
        if (inner.node.name === "OrderedList") {
          renumberList(inner.item, doc, changes, -2);
        }
        if (next && next.node.name === "OrderedList") {
          renumberList(next.item, doc, changes);
        }
        return {
          range: EditorSelection.cursor(delTo + insert.length),
          changes,
        };
      }
      // Move this line down
      let insert = "";
      for (let i = 0, e = context.length - 2; i <= e; i += 1) {
        insert += context[i].blank(i < e);
      }
      insert += state.lineBreak;
      return {
        range: EditorSelection.cursor(pos + insert.length),
        changes: { from: line.from, insert },
      };
    }

    const changes: ChangeSpec[] = [];
    if (inner.node.name === "OrderedList") {
      renumberList(inner.item, doc, changes);
    }
    let insert = state.lineBreak;
    const continued = inner.item && inner.item.from < line.from;
    // If not dedented
    if (!continued || START_REGEX.exec(line.text)?.[0].length >= inner.to) {
      for (let i = 0, e = context.length - 1; i <= e; i += 1) {
        insert +=
          i === e && !continued
            ? context[i].marker(doc, 1)
            : context[i].blank();
      }
    }
    let from = pos;
    while (
      from > line.from &&
      /\s/.test(line.text.charAt(from - line.from - 1))
    ) {
      from -= 1;
    }
    changes.push({ from, to: pos, insert });
    return { range: EditorSelection.cursor(from + insert.length), changes };
  });
  if (dont) return false;
  dispatch(state.update(changes, { scrollIntoView: true, userEvent: "input" }));
  return true;
};

function isMark(node: SyntaxNode) {
  return node.name === "QuoteMark" || node.name === "ListMark";
}

function contextNodeForDelete(tree: Tree, pos: number) {
  let node = tree.resolveInner(pos, -1);
  let scan = pos;
  if (isMark(node)) {
    scan = node.from;
    node = node.parent;
  }
  for (let prev; (prev = node.childBefore(scan)); ) {
    if (isMark(prev)) {
      scan = prev.from;
    } else if (prev.name === "OrderedList") {
      node = prev.lastChild;
      scan = node.to;
    } else {
      break;
    }
  }
  return node;
}

/// This command will, when invoked in a Markdown context with the
/// cursor directly after list or blockquote markup, delete one level
/// of markup. When the markup is for a list, it will be replaced by
/// spaces on the first invocation (a further invocation will delete
/// the spaces), to make it easy to continue a list.
///
/// When not after Markdown block markup, this command will return
/// false, so it is intended to be bound alongside other deletion
/// commands, with a higher precedence than the more generic commands.
export const deleteMarkupBackward: StateCommand = ({ state, dispatch }) => {
  const tree = syntaxTree(state);
  let dont = null;
  const changes = state.changeByRange((range) => {
    const pos = range.from;
    const { doc } = state;
    if (range.empty && sparkLanguage.isActiveAt(state, range.from)) {
      const line = doc.lineAt(pos);
      const context = getContext(
        contextNodeForDelete(tree, pos),
        line.text,
        doc
      );
      if (context.length) {
        const inner = context[context.length - 1];
        const spaceEnd =
          inner.to - inner.spaceAfter.length + (inner.spaceAfter ? 1 : 0);
        // Delete extra trailing space after markup
        if (
          pos - line.from > spaceEnd &&
          !/\S/.test(line.text.slice(spaceEnd, pos - line.from))
        )
          return {
            range: EditorSelection.cursor(line.from + spaceEnd),
            changes: { from: line.from + spaceEnd, to: pos },
          };
        if (pos - line.from === spaceEnd) {
          const start = line.from + inner.from;
          // Replace a list item marker with blank space
          if (
            inner.item &&
            inner.node.from < inner.item.from &&
            /\S/.test(line.text.slice(inner.from, inner.to))
          )
            return {
              range,
              changes: {
                from: start,
                to: line.from + inner.to,
                insert: inner.blank(),
              },
            };
          // Delete one level of indentation
          if (start < pos)
            return {
              range: EditorSelection.cursor(start),
              changes: { from: start, to: pos },
            };
        }
      }
    }
    return (dont = { range });
  });
  if (dont) {
    return false;
  }
  dispatch(
    state.update(changes, { scrollIntoView: true, userEvent: "delete" })
  );
  return true;
};

const changeBySelectedLine = (
  state: EditorState,
  f: (
    line: Line,
    changes: ChangeSpec[],
    range: SelectionRange,
    minOffset: number,
    action: "comment" | "uncomment",
    commmentMatch: RegExpMatchArray
  ) => void
) => {
  let atLine = -1;
  return state.changeByRange((range) => {
    const changes: ChangeSpec[] = [];
    let minOffset = Number.MAX_SAFE_INTEGER;
    let action: "comment" | "uncomment" = "uncomment";
    const commentMatches: RegExpMatchArray[] = [];
    for (let pos = range.from; pos <= range.to; ) {
      const line = state.doc.lineAt(pos);
      const indentMatch = line.text.match(sparkRegexes.indent);
      const indentText = indentMatch[1] || "";
      if (indentText.length < minOffset) {
        minOffset = indentText.length;
      }
      const commentMatch = line.text.match(sparkRegexes.comment_inline);
      commentMatches.push(commentMatch);
      if (line.text.trim() && !commentMatch) {
        action = "comment";
      }
      pos = line.to + 1;
    }
    let index = 0;
    for (let pos = range.from; pos <= range.to; ) {
      const line = state.doc.lineAt(pos);
      if (line.number > atLine && (range.empty || range.to > line.from)) {
        f(line, changes, range, minOffset, action, commentMatches[index]);
        atLine = line.number;
      }
      pos = line.to + 1;
      index += 1;
    }
    const changeSet = state.changes(changes);
    return {
      changes,
      range: EditorSelection.range(
        changeSet.mapPos(range.anchor, 1),
        changeSet.mapPos(range.head, 1)
      ),
    };
  });
};

/// This command, when invoked with cursor selection(s),
/// will comment out the current selected uncommented lines
/// or uncomment the current selected commented out lines
export const toggleComment: StateCommand = ({ state, dispatch }) => {
  if (state.readOnly) return false;
  dispatch(
    state.update(
      changeBySelectedLine(
        state,
        (line, changes, range, minOffset, action, commentMatch) => {
          if (action === "comment") {
            if (line.text.trim()) {
              const markAndSpace = "// ";
              const from = line.from + minOffset;
              changes.push({ from, insert: markAndSpace });
            }
          } else if (commentMatch) {
            const mark = commentMatch[0] || "";
            const commentIndex = line.text.indexOf(mark);
            const from = line.from + commentIndex;
            const to = from + mark.length;
            changes.push({ from, to, insert: "" });
          }
        }
      ),
      { userEvent: "input.comment" }
    )
  );
  return true;
};
