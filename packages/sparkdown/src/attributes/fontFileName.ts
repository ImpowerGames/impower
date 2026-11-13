export const FONT_STYLE_SUFFIXES = ["", "@bold", "@italic", "@bolditalic", "@italicbold"] as const;

export interface FontFileName {
  family: string;
  weight: "700" | "normal";
  style: "italic" | "normal";
}

export const fontFileNameOf = (name: string): FontFileName => {
  const at = name.indexOf("@");
  const family = at > 0 ? name.slice(0, at) : name;
  const word = at > 0 ? name.slice(at + 1).toLowerCase() : "";
  const bold = word === "bold" || word === "bolditalic" || word === "italicbold";
  const italic = word === "italic" || word === "bolditalic" || word === "italicbold";
  return { family, weight: bold ? "700" : "normal", style: italic ? "italic" : "normal" };
};
