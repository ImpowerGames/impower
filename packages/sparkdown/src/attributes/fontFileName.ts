const BOLD_WORDS = new Set(["bold", "bolditalic", "italicbold"]);
const ITALIC_WORDS = new Set(["italic", "bolditalic", "italicbold"]);

export interface FontFileName {
  family: string;
  weight: "700" | "normal";
  style: "italic" | "normal";
}

export const fontFileNameOf = (name: string): FontFileName => {
  const regular: FontFileName = { family: name, weight: "normal", style: "normal" };
  const at = name.indexOf("@");
  if (at <= 0) {
    return regular;
  }
  const pieces = name
    .slice(at + 1)
    .toLowerCase()
    .split("@");
  if (!pieces.every((piece) => BOLD_WORDS.has(piece) || ITALIC_WORDS.has(piece))) {
    return regular;
  }
  return {
    family: name.slice(0, at),
    weight: pieces.some((piece) => BOLD_WORDS.has(piece)) ? "700" : "normal",
    style: pieces.some((piece) => ITALIC_WORDS.has(piece)) ? "italic" : "normal",
  };
};

export const fontStyleSuffixOf = (name: string, family: string): string | undefined =>
  fontFileNameOf(name).family === family ? name.slice(family.length) : undefined;
