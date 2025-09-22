import { ScreenplayToken } from "../types/ScreenplayToken";

export const generateScreenplayCsvData = (
  tokens: ScreenplayToken[],
  language = "en-US"
): string[][] => {
  const strings: string[][] = [["KEY", "CONTEXT", language]];
  (tokens || []).forEach((t) => {
    if (t.tag === "dialogue_content") {
      strings.push([t.id, `D`, t.text]);
    }
    if (t.tag === "action") {
      strings.push([t.id, `A`, t.text]);
    }
    if (t.tag === "transitional") {
      strings.push([t.id, `T`, t.text]);
    }
    if (t.tag === "heading") {
      strings.push([t.id, `H`, t.text]);
    }
  });
  return strings;
};
