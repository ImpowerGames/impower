import { ControlCommand } from "./ControlCommand";
import { throwNullException } from "./NullException";
import type { InkObject } from "./Object";
import { StringBuilder } from "./StringBuilder";
import { StringValue } from "./Value";

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

export function findOpenString(stream: InkObject[], hint: number): number {
  if (hint >= 0 && hint < stream.length && isBeginString(stream[hint])) {
    return hint;
  }
  for (let i = 0; i < stream.length; i++) {
    if (isBeginString(stream[i])) return i;
  }
  return -1;
}

export function isBeginString(obj: InkObject | null | undefined): boolean {
  return (
    obj instanceof ControlCommand &&
    obj.commandType == ControlCommand.CommandType.BeginString
  );
}
