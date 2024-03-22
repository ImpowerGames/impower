import GRAMMAR_DEFINITION from "../../language/sparkdown.language-grammar.json";

const INDENT_UNIT = GRAMMAR_DEFINITION.indentUnit;

const calculateIndent = (text: string): number => {
  let tabCount = 0;
  let spaceCount = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]!;
    if (c === "\t") {
      tabCount += 1;
    }
    if (c === " ") {
      spaceCount += 1;
    }
  }
  const spaceMultiplier = INDENT_UNIT?.[0] === " " ? 1 / INDENT_UNIT.length : 0;
  return tabCount + spaceCount * spaceMultiplier;
};

export default calculateIndent;
