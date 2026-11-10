import { GrammarRegistry } from "@impower/textmate-grammar-tree/src/grammar/classes/GrammarRegistry";
import LUAU_FILE_GRAMMAR_DEFINITION from "../../../language/sparkdown-luau.language-grammar.json";
import GRAMMAR_DEFINITION from "../../../language/sparkdown.language-grammar.json";
import { isLuauFile } from "../typecheck/LuauUnitNodes";

export const LUAU_FILE_GRAMMAR_REGISTRY = new GrammarRegistry(
  [GRAMMAR_DEFINITION, LUAU_FILE_GRAMMAR_DEFINITION],
  LUAU_FILE_GRAMMAR_DEFINITION.scopeName,
);

export function sparkdownGrammarFor(uri: string | undefined): typeof GRAMMAR_DEFINITION | GrammarRegistry {
  return uri !== undefined && isLuauFile(uri) ? LUAU_FILE_GRAMMAR_REGISTRY : GRAMMAR_DEFINITION;
}
