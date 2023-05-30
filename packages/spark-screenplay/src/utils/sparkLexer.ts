import { sparkRegexes, SparkRegexType } from "../../../sparkdown";
import { LexerReplacements } from "../types/LexerReplacements";

export const sparkLexer = (
  s: string,
  type: string | undefined,
  replacer: LexerReplacements,
  titlePage = false
): string => {
  if (!s) {
    return s;
  }

  const styles: SparkRegexType[] = [
    "underline",
    "italic",
    "bold",
    "bold_italic",
    "italic_underline",
    "bold_underline",
    "bold_italic_underline",
  ];
  let i = styles.length;
  let style;
  let match;

  if (titlePage) {
    s = s.replace(sparkRegexes.link, replacer.link);
  }
  s = s
    .replace(sparkRegexes.note, replacer.note)
    .replace(/\\\*/g, "[star]")
    .replace(/\\_/g, "[underline]")
    .replace(/\n/g, replacer.line_break);

  while (i--) {
    style = styles[i];
    if (!style) {
      break;
    }
    match = sparkRegexes[style];

    if (match.test(s)) {
      s = s.replace(match, replacer[style] || "");
    }
  }
  s = s.replace(/\[star\]/g, "*").replace(/\[underline\]/g, "_");
  if (type !== "action") {
    s = s.trim();
  }
  return s;
};
