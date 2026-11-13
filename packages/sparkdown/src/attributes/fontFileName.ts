const BOLD_WORDS = new Set(["bold", "bolditalic", "italicbold"]);
const ITALIC_WORDS = new Set(["italic", "bolditalic", "italicbold"]);

export interface FontFileName {
  family: string;
  weight: "700" | "normal";
  style: "italic" | "normal";
}

export const fontFileNameOf = (name: string): FontFileName => {
  const at = name.indexOf("@");
  const word = at > 0 ? name.slice(at + 1).toLowerCase() : "";
  const styled = BOLD_WORDS.has(word) || ITALIC_WORDS.has(word);
  return {
    family: styled ? name.slice(0, at) : name,
    weight: BOLD_WORDS.has(word) ? "700" : "normal",
    style: ITALIC_WORDS.has(word) ? "italic" : "normal",
  };
};

export const fontStyleSuffixOf = (name: string, family: string): string | undefined => {
  if (name === family) {
    return "";
  }
  if (!name.startsWith(family + "@")) {
    return undefined;
  }
  const word = name.slice(family.length + 1).toLowerCase();
  return BOLD_WORDS.has(word) || ITALIC_WORDS.has(word) ? name.slice(family.length) : undefined;
};
