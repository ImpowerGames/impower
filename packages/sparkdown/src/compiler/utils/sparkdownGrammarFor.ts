import GRAMMAR_DEFINITION from "../../../language/sparkdown.language-grammar.json";
import { isLuauFile } from "../typecheck/LuauUnitNodes";

export const LUAU_FILE_GRAMMAR_DEFINITION: typeof GRAMMAR_DEFINITION = {
  ...GRAMMAR_DEFINITION,
  patterns: [{ include: `#${GRAMMAR_DEFINITION.luauFile.rule}` }],
};

export function sparkdownGrammarFor(uri: string | undefined): typeof GRAMMAR_DEFINITION {
  return uri !== undefined && isLuauFile(uri) ? LUAU_FILE_GRAMMAR_DEFINITION : GRAMMAR_DEFINITION;
}
