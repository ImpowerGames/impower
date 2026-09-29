import { ControlCommand } from "./ControlCommand";
import { throwNullException } from "./NullException";
import type { InkObject } from "./Object";
import { StringBuilder } from "./StringBuilder";
import { StringValue } from "./Value";

// The rules both story engines apply to their output (the current
// engine's `StoryState` and the binary program's `ProgramStoryState`), kept in
// one place so the two cannot drift apart.

/**
 * `str` as a story shows it: escapes processed when `processEscapes` is set,
 * and runs of spaces and tabs collapsed to one space, with none at the start
 * or end of a line, when `collapseWhitespace` is set. A game turns both off.
 */
export function cleanOutputWhitespace(
  str: string,
  processEscapes: boolean,
  collapseWhitespace: boolean,
): string {
  if (processEscapes) {
    let sb = new StringBuilder();
    let escaped = false;
    for (let i = 0; i < str.length; i++) {
      let c = str.charAt(i);
      if (escaped) {
        sb.Append(c);
        escaped = false;
      } else {
        const isEscape = c == "\\";
        if (!isEscape) {
          sb.Append(c);
        }
        escaped = isEscape;
      }
    }
    str = sb.toString();
  }
  if (collapseWhitespace) {
    let sb = new StringBuilder();
    let currentWhitespaceStart = -1;
    let startOfLine = 0;
    for (let i = 0; i < str.length; i++) {
      let c = str.charAt(i);
      let isInlineWhitespace = c == " " || c == "\t";
      if (isInlineWhitespace && currentWhitespaceStart == -1)
        currentWhitespaceStart = i;
      if (!isInlineWhitespace) {
        if (
          c != "\n" &&
          currentWhitespaceStart > 0 &&
          currentWhitespaceStart != startOfLine
        ) {
          sb.Append(" ");
        }
        currentWhitespaceStart = -1;
      }
      if (c == "\n") startOfLine = i + 1;
      if (!isInlineWhitespace) sb.Append(c);
    }
    return sb.toString();
  } else {
    return str;
  }
}

/**
 * `single` split at the newlines that open and close it, so that each
 * newline reaches the output on its own: the spaces before the first newline,
 * that newline, the inner text, the last newline and the spaces after it, each
 * where present. Null when the text neither starts nor ends with a newline
 * after its spaces and tabs.
 */
export function splitHeadTailWhitespace(
  single: StringValue,
): StringValue[] | null {
  let str = single.value;
  if (str === null) {
    return throwNullException("single.value");
  }

  let headFirstNewlineIdx = -1;
  let headLastNewlineIdx = -1;
  for (let i = 0; i < str.length; i++) {
    let c = str[i];
    if (c == "\n") {
      if (headFirstNewlineIdx == -1) headFirstNewlineIdx = i;
      headLastNewlineIdx = i;
    } else if (c == " " || c == "\t") continue;
    else break;
  }

  let tailLastNewlineIdx = -1;
  let tailFirstNewlineIdx = -1;
  for (let i = str.length - 1; i >= 0; i--) {
    let c = str[i];
    if (c == "\n") {
      if (tailLastNewlineIdx == -1) tailLastNewlineIdx = i;
      tailFirstNewlineIdx = i;
    } else if (c == " " || c == "\t") continue;
    else break;
  }

  // No splitting to be done?
  if (headFirstNewlineIdx == -1 && tailLastNewlineIdx == -1) return null;

  let listTexts: StringValue[] = [];
  let innerStrStart = 0;
  let innerStrEnd = str.length;

  if (headFirstNewlineIdx != -1) {
    if (headFirstNewlineIdx > 0) {
      let leadingSpaces = new StringValue(str.substring(0, headFirstNewlineIdx));
      listTexts.push(leadingSpaces);
    }
    listTexts.push(new StringValue("\n"));
    innerStrStart = headLastNewlineIdx + 1;
  }

  if (tailLastNewlineIdx != -1) {
    innerStrEnd = tailFirstNewlineIdx;
  }

  if (innerStrEnd > innerStrStart) {
    let innerStrText = str.substring(innerStrStart, innerStrEnd);
    listTexts.push(new StringValue(innerStrText));
  }

  if (tailLastNewlineIdx != -1 && tailFirstNewlineIdx > headLastNewlineIdx) {
    listTexts.push(new StringValue("\n"));
    if (tailLastNewlineIdx < str.length - 1) {
      let numSpaces = str.length - tailLastNewlineIdx - 1;
      let trailingSpaces = new StringValue(
        str.substring(tailLastNewlineIdx + 1, tailLastNewlineIdx + 1 + numSpaces),
      );
      listTexts.push(trailingSpaces);
    }
  }

  return listTexts;
}

/**
 * The index of the outermost `BeginString` in `stream`, or -1 when the output
 * is not inside a string evaluation. `hint` is the index a previous call
 * returned: it is trusted only while it still holds a `BeginString`, so any
 * rewrite of the stream in between costs at most one scan.
 *
 * Both engines ask this on every push. Inside an interpolation the
 * `BeginString` sits before everything the evaluation pushes, so walking the
 * stream on each call made a loop there cost more with every step (#1134).
 */
export function findOpenString(stream: InkObject[], hint: number): number {
  if (hint >= 0 && hint < stream.length && isBeginString(stream[hint])) {
    return hint;
  }
  for (let i = 0; i < stream.length; i++) {
    if (isBeginString(stream[i])) return i;
  }
  return -1;
}

function isBeginString(obj: InkObject | undefined): boolean {
  return (
    obj instanceof ControlCommand &&
    obj.commandType == ControlCommand.CommandType.BeginString
  );
}
