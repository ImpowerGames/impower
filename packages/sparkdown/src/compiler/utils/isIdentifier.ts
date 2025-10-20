import GRAMMAR_DEFINITION from "../../../language/sparkdown.language-grammar.json";

const IDENTIFIER_REGEX = new RegExp(
  `^${GRAMMAR_DEFINITION.repository.Identifier.match}$`,
  "u"
);

export const isIdentifier = (str: string) => IDENTIFIER_REGEX.test(str);
