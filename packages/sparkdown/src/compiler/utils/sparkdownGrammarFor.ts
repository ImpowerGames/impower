import GRAMMAR_DEFINITION from "../../../language/sparkdown.language-grammar.json";
import { isLuauFile } from "../typecheck/LuauUnitNodes";

/**
 * The Sparkdown grammar with the root a `.luau` document is read from (the
 * grammar's `luauFile.rule`), which is Luau from its first line: the same
 * rules and nodes, started on a pure-Luau block body instead of a `.sd`
 * script's top level.
 */
export const LUAU_FILE_GRAMMAR_DEFINITION: typeof GRAMMAR_DEFINITION = {
  ...GRAMMAR_DEFINITION,
  patterns: [{ include: `#${GRAMMAR_DEFINITION.luauFile.rule}` }],
};

/**
 * The grammar a document is read with, by its uri: the `.luau` root for a
 * `.luau` file (`isLuauFile`), the `.sd` root for every other document and
 * for text with no document.
 */
export function sparkdownGrammarFor(uri: string | undefined): typeof GRAMMAR_DEFINITION {
  return uri !== undefined && isLuauFile(uri) ? LUAU_FILE_GRAMMAR_DEFINITION : GRAMMAR_DEFINITION;
}
