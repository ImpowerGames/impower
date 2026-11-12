import {
  SCAN_CLOSE,
  SCAN_OPEN,
  SPAN_CLOSE,
  SPAN_END,
  spanOpenMark,
} from "../../runtime/displayStyle";

export interface StyleRun {
  text: string;
  marks?: string[];
  value?: true;
  ended?: true;
}

export function styleRuns(text: string): StyleRun[] {
  const runs: StyleRun[] = [];
  const marks: string[] = [];
  let value = false;
  let current: StyleRun | null = null;
  for (const char of text) {
    if (char === SCAN_OPEN || char === SCAN_CLOSE) {
      value = char === SCAN_OPEN;
      current = null;
    } else if (char === SPAN_CLOSE || char === SPAN_END) {
      if (char === SPAN_END && current) current.ended = true;
      marks.pop();
      current = null;
    } else {
      const opened = spanOpenMark(char);
      if (opened) {
        marks.push(opened);
        current = null;
        continue;
      }
      if (!current) {
        current = { text: "" };
        if (marks.length > 0) current.marks = [...marks];
        if (value) current.value = true;
        runs.push(current);
      }
      current.text += char;
    }
  }
  return runs;
}
